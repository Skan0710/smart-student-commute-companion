const axios = require('axios');

function buildDeterministicExplanation(recommendedRoute, scoringResults, weather, activeReports, userPreferences) {
  if (!recommendedRoute) {
    return {
      recommendedRouteId: null,
      departureTime: null,
      summary: 'No viable commute options found for the selected criteria.',
      reason: 'Please adjust your walking distance, budget, or preferred transportation modes.',
      warnings: ['No matching routes found.'],
      confidence: 'none',
      aiProvider: 'Deterministic Grounded Engine'
    };
  }

  const warnings = [];

  // Weather warning
  if (weather && weather.rainProbability > 40) {
    warnings.push(`High rain probability (${weather.rainProbability}%). Outdoor walking legs carry elevated delay and soaking risk.`);
  }

  // Disruption warnings strictly along the recommended route corridor
  if (recommendedRoute.disruptionAlerts && recommendedRoute.disruptionAlerts.length > 0) {
    recommendedRoute.disruptionAlerts.forEach(a => {
      warnings.push(`⚠ Community report in ${a.area}: "${a.message}" (${a.ageFormatted})`);
    });
  }

  // Explaining why the recommended option is best
  const rec = recommendedRoute;
  const pref = userPreferences.preference || 'balanced';
  const fastAlt = scoringResults.fastestAlternative;
  const cheapAlt = scoringResults.cheapestAlternative;

  let reason = '';
  if (pref === 'fastest') {
    reason = `${rec.title} is selected because it delivers the earliest estimated arrival at ${rec.estimatedArrival} (${rec.durationMinutes} mins total duration) with minimal transfer friction.`;
  } else if (pref === 'cheapest') {
    reason = `${rec.title} is the most economical student option at ₹${rec.fareRupees}, saving up to ₹${Math.max(0, (fastAlt?.fareRupees || rec.fareRupees) - rec.fareRupees)} compared to road alternatives while maintaining reliable scheduled headway.`;
  } else if (pref === 'rain-safe') {
    reason = `${rec.title} maximizes sheltered transit with only ${rec.walkingDurationMinutes} mins of outdoor walking exposure, protecting against the ${weather.condition} forecast.`;
  } else {
    // Balanced
    reason = `${rec.title} provides the optimal balance of travel time (${rec.durationMinutes} mins), student-friendly fare (₹${rec.fareRupees}), and high transit reliability (${rec.scores?.reliability || 85}% index).`;
  }

  // If there are active disruptions strictly in recommended route corridor, incorporate them
  if (rec.disruptionAlerts && rec.disruptionAlerts.length > 0) {
    const mainDisruption = rec.disruptionAlerts[0];
    reason += ` Note: Although community reports flagged ${mainDisruption.impact} delay/congestion in ${mainDisruption.area}, this route remains the strongest option due to dedicated right-of-way advantages.`;
  }

  return {
    recommendedRouteId: rec.id,
    departureTime: rec.estimatedDeparture,
    summary: `Recommended: ${rec.title} via ${rec.transitStations ? rec.transitStations.map(s => s.name).join(' → ') : (rec.legs ? rec.legs.map(l => l.from).join(' → ') : 'direct transit')} (Est. ${rec.durationMinutes} mins, ₹${rec.fareRupees}). Depart by ${rec.estimatedDeparture} to reach on time.`,
    reason,
    warnings,
    confidence: rec.transitReliabilityScore >= 80 ? 'high' : 'medium',
    aiProvider: 'Deterministic Decision Engine'
  };
}

async function generateAiRecommendation(candidates, scoringResults, weather, activeReports, userPreferences, targetArrival) {
  const recommendedRoute = scoringResults.rankedCandidates[0];
  if (!recommendedRoute) {
    return buildDeterministicExplanation(null, scoringResults, weather, activeReports, userPreferences);
  }

  // Only pass community reports that are strictly relevant to the generated candidate routes
  const candidateReportIds = new Set(
    candidates.flatMap(c => (c.disruptionAlerts || []).map(a => a.id))
  );
  const relevantReports = (activeReports || []).filter(r => candidateReportIds.has(r.id));

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return buildDeterministicExplanation(recommendedRoute, scoringResults, weather, activeReports, userPreferences);
  }

  try {
    let GoogleGenAI;
    try {
      GoogleGenAI = require('@google/genai').GoogleGenAI;
    } catch (e) {
      GoogleGenAI = null;
    }

    const promptPayload = {
      role: 'user',
      task: 'Recommend and explain the best student commute option among the provided factual candidates.',
      userPreferences: {
        desiredArrival: targetArrival,
        preference: userPreferences.preference || 'balanced',
        walkingToleranceMinutes: userPreferences.walkingToleranceMinutes || 20,
        budgetRupees: userPreferences.maxBudgetRupees || 100
      },
      weatherFacts: {
        condition: weather.condition,
        temperatureC: weather.temperatureC,
        rainProbability: weather.rainProbability,
        rainRisk: weather.rainRisk
      },
      communityReports: relevantReports.slice(0, 5).map(r => ({
        area: r.area,
        mode: r.mode,
        message: r.message,
        impact: r.impact,
        age: r.ageFormatted,
        confirmationCount: r.confirmation_count
      })),
      candidateRoutes: candidates.map(c => ({
        id: c.id,
        title: c.title,
        subtitle: c.subtitle,
        primaryMode: c.primaryMode,
        durationMinutes: c.durationMinutes,
        walkingMinutes: c.walkingDurationMinutes,
        fareRupees: c.fareRupees,
        transfers: c.transfers,
        departureTime: c.estimatedDeparture,
        arrivalTime: c.estimatedArrival,
        compositeScore: c.scores?.composite || 75,
        disruptions: (c.disruptionAlerts || []).map(a => `${a.area}: ${a.message}`)
      }))
    };

    const systemInstruction = `You are the Smart Student Commute Companion AI for Mumbai college commutes.
CRITICAL INSTRUCTIONS:
1. You must ONLY reason over the provided factual candidate routes, weather facts, and student community reports.
2. DO NOT INVENT or hallucinate routes, bus numbers, train numbers, station names, fares, travel times, weather conditions, or disruptions.
3. Select the best route matching the student's preferences (e.g. balanced, fastest, cheapest, rain-safe).
4. Explain clearly WHY the selected option is best compared to alternatives.
5. STRICT TRAVEL CORRIDOR RULE: Route advisories and warnings must ONLY be given if they are within the physical travel corridor of the recommended route. Do NOT mention disruptions at locations that are outside the travel plan (e.g. For Dadar to CST, never mention issues at Andheri or Ghatkopar).
6. Output strictly valid JSON matching this schema:
{
  "recommendedRouteId": "string (must match one of the candidate IDs)",
  "departureTime": "string (e.g. '08:15 AM')",
  "summary": "string (1-2 sentences summarizing the commute)",
  "reason": "string (concise paragraph explaining why this route wins over alternatives)",
  "warnings": ["string", "string"],
  "confidence": "high" | "medium" | "low"
}`;

    if (GoogleGenAI) {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: `${systemInstruction}\n\nContext:\n${JSON.stringify(promptPayload, null, 2)}` }] }
        ],
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 2048 }
        }
      });

      if (response && response.text) {
        const parsed = JSON.parse(response.text.trim());
        const recRoute = candidates.find(c => c.id === parsed.recommendedRouteId) || recommendedRoute;
        const validAreas = (recRoute?.disruptionAlerts || []).map(a => (a.area || '').toLowerCase());
        const filteredWarnings = (parsed.warnings || []).filter(w => {
          const wLower = w.toLowerCase();
          if (wLower.includes('rain') || wLower.includes('weather')) return true;
          return validAreas.some(area => wLower.includes(area));
        });
        return {
          ...parsed,
          warnings: filteredWarnings.length > 0 ? filteredWarnings : (recRoute?.disruptionAlerts || []).map(a => `⚠ Community report in ${a.area}: "${a.message}" (${a.ageFormatted})`),
          aiProvider: 'Gemini 3.8 Flash'
        };
      }
    } else {
      // Direct REST fallback to generativelanguage API
      const restUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
      const restRes = await axios.post(restUrl, {
        contents: [
          { parts: [{ text: `${systemInstruction}\n\nContext:\n${JSON.stringify(promptPayload, null, 2)}` }] }
        ],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      }, { timeout: 7000, headers: { 'x-goog-api-key': apiKey } });

      const text = restRes.data.candidates[0].content.parts[0].text;
      const parsed = JSON.parse(text);
      const recRoute = candidates.find(c => c.id === parsed.recommendedRouteId) || recommendedRoute;
      const validAreas = (recRoute?.disruptionAlerts || []).map(a => (a.area || '').toLowerCase());
      const filteredWarnings = (parsed.warnings || []).filter(w => {
        const wLower = w.toLowerCase();
        if (wLower.includes('rain') || wLower.includes('weather')) return true;
        return validAreas.some(area => wLower.includes(area));
      });
      return {
        ...parsed,
        warnings: filteredWarnings.length > 0 ? filteredWarnings : (recRoute?.disruptionAlerts || []).map(a => `⚠ Community report in ${a.area}: "${a.message}" (${a.ageFormatted})`),
        aiProvider: 'Gemini 3.8 Flash'
      };
    }
  } catch (err) {
    console.warn(`Gemini AI inference failed: ${err.message}. Falling back to deterministic grounded engine.`);
  }

  return buildDeterministicExplanation(recommendedRoute, scoringResults, weather, activeReports, userPreferences);
}

module.exports = {
  buildDeterministicExplanation,
  generateAiRecommendation
};
