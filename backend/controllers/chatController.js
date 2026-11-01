/**
 * Chat Controller - Campus & Transit Assistant
 *
 * Uses Groq (Llama 3.3 70B) for ultra-fast, intelligent student assistance.
 * Falls back to local grounded Mumbai transit & campus knowledge if GROQ_API_KEY is not provided.
 */

const KNOWLEDGE_BASE = [
  {
    triggers: ['djsce', 'college', 'sanghvi', 'vile parle', 'reach', 'how to get', 'direction', 'where is'],
    reply: `**Reaching D.J. Sanghvi College of Engineering (Vile Parle West):**
• **Western Railway Local**: Take a train to **Vile Parle Station**. Exit West, head towards Cooper Hospital / Irla road (approx. 8–10 minutes walking or ₹23 minimum auto fare).
• **Metro Line 1 (Versova–Ghatkopar)**: Get down at **D.N. Nagar Station**, then take an auto (10 mins) or BEST Bus (224/225) towards Irla.
• **Metro Line 2A (Dahisar–Andheri West)**: Get down at **D.N. Nagar** or **Andheri West**.
• **BEST Buses**: Route **A-422** (from Vikhroli/Powai to Erla/Vile Parle), **C-40**, and **224** drop near Prime Mall / Cooper Hospital.`
  },
  {
    triggers: ['vikhroli', 'powai', 'central', '422', 'a-422', 'erla', 'irla'],
    reply: `**Vikhroli to DJ Sanghvi College Route Options:**
1. **Direct Walking + Bus + Walking**:
   • Walk to *Municipal Office Vikhroli* bus stop.
   • Board BEST AC bus **A-422** towards Agarkar Chowk / Erla.
   • Alight at **Erla / Cooper Hospital**, and walk 400m to DJ Sanghvi College.
2. **Train Route**: Central Line from Vikhroli to Dadar, interchange to Western Line to Vile Parle, then 8 min walk.`
  },
  {
    triggers: ['timetable', 'ocr', 'scan', 'camera', 'upload', 'extract'],
    reply: `**How to use the Timetable Scanner:**
1. Open the **Schedule** tab in the Academic Hub.
2. Click the banner **"Got a TimeTable? Upload it"**.
3. Select an image (PNG/JPG) of your college timetable schedule.
4. Our on-device **Tesseract OCR engine** will extract subject codes, timings, and days.
5. Review and edit the detected class slots in the table, then click **"Save to Schedule"**!`
  },
  {
    triggers: ['rain', 'waterlog', 'monsoon', 'delay', 'weather', 'flood'],
    reply: `**Mumbai Transit Monsoon Advisory:**
• Our route planner tracks live rain probabilities and crowd-sourced waterlogging alerts along Western and Central railway tracks.
• High-risk spots (Milan Subway, Andheri Subway, Hindmata) trigger automatic pedestrian detour penalties.
• Check the **Live Alerts** tab to report or view ongoing transit bottlenecks.`
  },
  {
    triggers: ['dadar', 'cst', 'thane', 'borivali', 'andheri'],
    reply: `**Quick Hub Travel Tips:**
• **From Borivali/Andheri**: Take any fast/slow Western Line local to Vile Parle or Andheri (switch to slow for Parle).
• **From Dadar**: Western Line Slow or Semi-Fast local directly to Vile Parle (Platform 1/2 at Dadar).
• **From Thane**: Central local to Ghatkopar, take Metro Line 1 to DN Nagar, then auto/bus to DJSCE.`
  },
  {
    triggers: ['pass', 'concession', 'railway pass', 'discount', 'fare'],
    reply: `**Student Railway Concession Pass:**
• Students enrolled at DJSCE can apply for monthly/quarterly railway concession passes through the college admin office.
• Valid between your home station and Vile Parle station for 1st or 2nd class local trains.`
  }
];

function generateLocalAnswer(prompt) {
  const query = (prompt || '').toLowerCase().trim();

  for (const item of KNOWLEDGE_BASE) {
    if (item.triggers.some(t => query.includes(t))) {
      return item.reply;
    }
  }

  return `I'm your **Campus & Transit Assistant**! I can help you with:
• **Routes to DJ Sanghvi**: Bus (A-422), Western local trains, or Metro Line 1 & 2A.
• **Timetable Scanner**: Upload a picture of your schedule and extract courses via OCR.
• **Academic Planner**: Organize assignments and schedule conflict-free study sessions.
• **Live Alerts**: Check waterlogging, delays, or traffic on Western Express Highway.

Try asking: *"How to reach college from Vikhroli?"* or *"How does the timetable scanner work?"*`;
}

async function callGroqChat(userMessage, conversationHistory = []) {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) return null;

  const systemPrompt = `You are the AI Campus & Transit Assistant for Dwarkadas J. Sanghvi College of Engineering (DJSCE) located in Vile Parle West, Mumbai.
You provide friendly, accurate, and concise guidance for college students regarding:
1. Commuting in Mumbai (Western Line local trains to Vile Parle station, Mumbai Metro Lines 1, 2A, 7, 3, and BEST buses especially route A-422 from Vikhroli to Erla/Vile Parle).
2. DJSCE campus landmarks (Irla, Cooper Hospital, Mithibai/NMIMS junction, Prime Mall).
3. Timetable OCR scanning (students can upload timetable photos to auto-extract course slots using device Tesseract OCR).
4. Academic and study planning.
Formatting: Use markdown bolding and bullet points. Keep answers practical, crisp, and student-friendly.`;

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

    // Try Groq API first if key is configured
    if (process.env.GROQ_API_KEY) {
      const groqReply = await callGroqChat(message, conversationHistory);
      if (groqReply) {
        return res.json({ reply: groqReply, source: 'groq-llama-3.3-70b' });
      }
    }

    // Grounded fallback if Groq key is absent or request fails
    const reply = generateLocalAnswer(message);
    return res.json({ reply, source: 'grounded-engine' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleChat
};
