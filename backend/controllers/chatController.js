/**
 * Chat Controller - Campus & Transit Assistant
 *
 * Uses Groq (Llama 3.3 70B) for ultra-fast, intelligent student assistance.
 * Falls back to generalized Mumbai transit & campus knowledge if GROQ_API_KEY is not provided.
 */

const KNOWLEDGE_BASE = [
  {
    triggers: ['djsce', 'dj sanghvi', 'sanghvi', 'vile parle', 'mithibai', 'nmims'],
    reply: `**Vile Parle Campus Transit Hub (DJSCE, NMIMS, Mithibai):**
• **Western Railway Local**: Take any slow local train to **Vile Parle Station**. Exit West and walk via Irla / Cooper Hospital road (approx. 8–10 minutes walking or minimum auto fare).
• **Metro Line 1 (Versova–Ghatkopar)**: Alight at **D.N. Nagar Station**, then take an auto (approx. 10 mins) or BEST feeder bus (224/225).
• **Metro Line 2A (Dahisar–Andheri West)**: Connect via **D.N. Nagar** or **Andheri West**.
• **BEST Buses**: Routes **A-422** (from Powai/Vikhroli), **C-40**, and **224** drop near Prime Mall and Cooper Hospital.`
  },
  {
    triggers: ['powai', 'iit', 'iit bombay', 'jvlr', 'vikhroli'],
    reply: `**Powai & Eastern Suburban Transit Hub (IIT Bombay, JVLR):**
• **Metro Line 1**: Connect to Ghatkopar or Jagruti Nagar, then take feeder bus / auto via JVLR.
• **Central Railway**: Alight at **Kanjurmarg** (West) or **Vikhroli** (West); 10–12 min auto ride to IIT Main Gate.
• **BEST Buses**: Route **A-422** connects Agarkar Chowk / Andheri / Erla directly through Powai and Vikhroli.`
  },
  {
    triggers: ['vjti', 'ict', 'matunga', 'wadala'],
    reply: `**Matunga & Wadala Campus Hub (VJTI, ICT, Khalsa):**
• **Central Railway**: Alight at **Matunga Station** (Central Line); walk 5–7 mins to VJTI/ICT campus.
• **Western Railway**: Alight at **Matunga Road Station** or Dadar; interchange or take a short auto.
• **Harbour Railway**: Alight at **Wadala Road Station**; 10 min walk to VJTI rear gate.`
  },
  {
    triggers: ['spit', 'bhavan', 'andheri west', 'munshi nagar'],
    reply: `**Andheri West Campus Hub (SPIT, SPJIMR, Bhavan's):**
• **Western Railway Local**: Alight at **Andheri Station** (West); walk 12–15 mins via Bhavans College Road or take an auto (5 mins).
• **Metro Line 1 & Line 2A**: Alight at **Azad Nagar** or **D.N. Nagar** stations for a quick 5-min auto/walk.`
  },
  {
    triggers: ['timetable', 'ocr', 'scan', 'camera', 'upload', 'extract'],
    reply: `**How to use the Timetable Scanner:**
1. Open the **Schedule** tab in the Academic Hub.
2. Click the banner **"Got a TimeTable? Upload it"**.
3. Select an image (PNG/JPG) of your college timetable schedule.
4. Our on-device **OCR engine** will automatically extract subject names, timings, and days.
5. Review and customize the detected class slots, then click **"Save to Schedule"** to sync conflict alerts!`
  },
  {
    triggers: ['rain', 'waterlog', 'monsoon', 'delay', 'weather', 'flood'],
    reply: `**Mumbai Transit Monsoon Advisory & Detour Strategies:**
• **Western Railway Bottlenecks**: Subways at Milan, Andheri, and Malad are susceptible to flooding during torrential rain; switch to elevated Metro Line 1 or 2A/7 corridors when subways are blocked.
• **Central Railway Bottlenecks**: Sion–Kurla and Chunabhatti tracks face waterlogging during high tide; check harbor rail status or choose road bypasses.
• **Live Alerts Tab**: Use the app's community feed to report or view crowd-sourced disruptions and track congestion in real time.`
  },
  {
    triggers: ['dadar', 'csmt', 'cst', 'thane', 'borivali', 'andheri', 'kurla'],
    reply: `**Major Mumbai Transit Interchanges:**
• **Dadar**: Primary Western ↔ Central junction. Fast locals connect to Churchgate and Borivali/Virar on Western, and CSMT and Thane/Kalyan on Central.
• **Andheri**: Key multimodal hub connecting Western Railway, Metro Line 1 (Ghatkopar–Versova), and Metro Line 2A/7 feeders.
• **Kurla**: Central ↔ Harbour junction. Switch here for trains heading to Navi Mumbai (Vashi/Panvel) or CSMT.
• **Ghatkopar**: Prime Central local ↔ Metro Line 1 interchange connecting Eastern and Western suburbs in 21 minutes.`
  },
  {
    triggers: ['pass', 'concession', 'railway pass', 'discount', 'fare'],
    reply: `**Student Railway Concession Pass Guidance:**
• Full-time college students in Mumbai can obtain authorized concession forms from their respective college admin offices.
• Concession applies for 1st Class or 2nd Class suburban travel on Western, Central, or Harbour lines between the student's designated home station and the college's nearest station.`
  }
];

function generateLocalAnswer(prompt) {
  const query = (prompt || '').toLowerCase().trim();

  for (const item of KNOWLEDGE_BASE) {
    if (item.triggers.some(t => query.includes(t))) {
      return item.reply;
    }
  }

  return `I'm your **Mumbai Student Transit & Campus Assistant**! I can help you with:
• **Transit Routes Across Mumbai**: Western, Central & Harbour local trains, Metro Lines 1, 2A, 7 & 3, and BEST feeder bus networks.
• **Campus Connectivity**: Directions and optimal transit hubs for colleges across Western suburbs, Central Mumbai, Powai, and South Mumbai.
• **Timetable OCR Scanner**: Extract subjects, timings, and days directly from schedule photos.
• **Monsoon & Live Alerts**: Check crowd-sourced delay updates and track waterlogging detours.

Try asking: *"What are the best routes to connect between Central and Western lines?"* or *"How do student railway concessions work in Mumbai?"*`;
}

async function callGroqChat(userMessage, conversationHistory = []) {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) return null;

  const systemPrompt = `You are the Smart Student Commute & Academic AI Assistant for college and university students across Mumbai.
You provide generalized, objective, and practical advice covering:
1. Mumbai Suburban Transit: Western Line, Central Line, Harbour Line local trains, Mumbai Metro (Lines 1, 2A, 7, 3), and BEST bus corridors.
2. General Campus Connectivity: Guide students with versatile options across major Mumbai educational hubs (Vile Parle, Andheri, Powai, Matunga, South Mumbai, Bandra, Navi Mumbai).
3. Academic & Schedule Management: Timetable OCR photo extraction, study planning, and deadline buffer recommendations.
4. Objective Guidance: Provide balanced, generalized explanations that apply broadly to any Mumbai student. Avoid hyper-personal assumptions unless explicitly prompted.
Formatting: Clear markdown bullet points and bolding. Keep answers crisp, accurate, and student-friendly.`;

  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  if (Array.isArray(conversationHistory)) {
    conversationHistory.slice(-4).forEach(m => {
      if (m.sender === 'user') messages.push({ role: 'user', content: m.text });
      else if (m.sender === 'bot') messages.push({ role: 'assistant', content: m.text });
    });
  }

  messages.push({ role: 'user', content: userMessage });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.5,
        max_tokens: 650
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`Groq API error (${response.status}):`, errText);
      return null;
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('Groq fetch failed or timed out:', err.message);
    return null;
  }
}

async function handleChat(req, res, next) {
  try {
    const { message, conversationHistory = [] } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Try AI response first; gracefully fall back to generalized local grounded knowledge
    const aiResponse = await callGroqChat(message, conversationHistory);
    const reply = aiResponse || generateLocalAnswer(message);

    return res.json({
      reply,
      isAi: Boolean(aiResponse)
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleChat
};
