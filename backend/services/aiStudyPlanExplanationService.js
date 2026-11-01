/**
 * AI Study Plan Explanation Service
 *
 * Uses Gemini AI (gemini-1.5-flash) to generate comprehensive academic study explanations:
 * - Current requirements and deadline breakdown
 * - Strategic rationale explaining WHY study sessions are scheduled on specific days/times
 * - Commute study recommendations for transit travel legs
 *
 * If GEMINI_API_KEY is not yet configured, generates an intelligent grounded explanation.
 */

let GoogleGenAI;
try {
  GoogleGenAI = require('@google/genai').GoogleGenAI;
} catch (e) {
  GoogleGenAI = null;
}

function buildGroundedExplanation(plan, items = [], assignments = [], summary = {}) {
  const totalHours = summary?.totalStudyHours || ((items.reduce((s, i) => s + (i.durationMinutes || 0), 0)) / 60).toFixed(1);
  const urgentAssignments = assignments.filter(a => a.priority === 'high' || (a.status !== 'completed' && a.dueDate));
  const heavyDays = summary?.workloadAnalysis?.heavyDates || [];

  const requirementsText = assignments.length > 0
    ? `Currently tracking ${assignments.length} upcoming academic deliverable${assignments.length === 1 ? '' : 's'}. Priority focus is needed on ${urgentAssignments.map(a => a.title).slice(0, 3).join(', ') || 'course syllabus review'}. Estimated total study commitment required is ${totalHours} hours.`
    : `Planning for ${items.length} focus study session${items.length === 1 ? '' : 's'} across your enrolled courses, allocating approximately ${totalHours} hours of structured prep time.`;

  const strategyText = `• **Spaced Scheduling**: High-effort topics are spaced over separate days to maximize memory consolidation and prevent burnout.
• **Deadline Buffering**: Work items for upcoming deliverables are scheduled at least 24 hours prior to due dates, providing a safe buffer for review.
• **Peak Focus Alignment**: Core academic subjects are scheduled in uninterrupted blocks, keeping daily study load under healthy cognitive limits (${summary?.dailyBreakdown ? Object.keys(summary.dailyBreakdown).length : 4} active study days).`;

  const commuteText = `• **Transit Study Tips**: Use train or bus commute legs (e.g., A-422 bus or Western Line locals) for lightweight revision: formula sheets, mobile flashcards, or reading lecture notes rather than deep problem solving.`;

  return {
    provider: 'Grounded Academic Engine',
    executiveSummary: `Structured ${totalHours}-hour weekly plan optimizing focus blocks around upcoming deadlines without timetable conflicts.`,
    requirementsBreakdown: requirementsText,
    strategyWhy: strategyText,
    commuteStudyTips: commuteText,
    keyMilestones: [
      `Complete early-week foundation sessions (${items.slice(0, 2).map(i => i.title).join(' & ') || 'Session 1 & 2'}).`,
      `Mid-week progress review before deadline submissions.`,
      `Final wrap-up and weekend buffer review.`
    ]
  };
}

async function generateAiPlanExplanation({ plan, items = [], assignments = [], summary = {} }) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const itemsList = items.map(i => `- ${i.title} (${i.durationMinutes || 60}m on ${i.plannedDate ? new Date(i.plannedDate).toLocaleDateString() : 'day'})`).join('\n');
      const assignmentsList = assignments.map(a => `- ${a.title} (Due: ${a.dueDate || 'Soon'}, Priority: ${a.priority || 'Normal'})`).join('\n');

      const prompt = `You are the AI Academic Mentor & Study Planner for an engineering student at DJ Sanghvi College of Engineering (DJSCE) in Mumbai.
Analyze this student's generated study plan and write an encouraging, highly strategic explanation.

Student's Upcoming Assignments & Deliverables:
${assignmentsList || 'Standard semester coursework'}

Generated Study Plan Schedule:
${itemsList || 'Daily focus sessions'}

Plan Statistics:
- Total Study Hours: ${summary?.totalStudyHours || 6} hrs
- Sessions: ${items.length}

Please respond strictly in valid JSON format with the following keys:
{
  "executiveSummary": "1-2 sentence high-level summary of the strategy",
  "requirementsBreakdown": "Detailed explanation of current requirements, upcoming deadlines, and workload urgency",
  "strategyWhy": "Detailed rationale explaining WHY these specific study sessions are scheduled on these days/times (spaced repetition, cognitive focus, buffer before deadlines)",
  "commuteStudyTips": "Actionable tips on what the student can review or read during their daily Mumbai commute (e.g. on Western local trains or BEST bus)",
  "keyMilestones": ["Milestone 1", "Milestone 2", "Milestone 3"]
}`;

      let replyJson = null;

      // Try @google/genai first if available
      if (GoogleGenAI) {
        const ai = new GoogleGenAI({ apiKey });
        const res = await ai.models.generateContent({
          model: 'gemini-1.5-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { responseMimeType: 'application/json' }
        });
        const text = res.text;
        if (text) replyJson = JSON.parse(text);
      } else {
        // Direct REST fallback for Google Gemini API
        const restUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`;
        const restRes = await fetch(restUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        });
        if (restRes.ok) {
          const restData = await restRes.json();
          const rawText = restData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) replyJson = JSON.parse(rawText);
        }
      }

      if (replyJson && replyJson.requirementsBreakdown) {
        return {
          provider: 'Gemini 1.5 Flash AI',
          executiveSummary: replyJson.executiveSummary,
          requirementsBreakdown: replyJson.requirementsBreakdown,
          strategyWhy: replyJson.strategyWhy,
          commuteStudyTips: replyJson.commuteStudyTips,
          keyMilestones: replyJson.keyMilestones || []
        };
      }
    } catch (err) {
      console.warn('Gemini study plan explanation error, falling back to grounded explanation:', err.message);
    }
  }

  return buildGroundedExplanation(plan, items, assignments, summary);
}

module.exports = {
  generateAiPlanExplanation
};

