/**
 * Chat Controller - Campus & Transit Assistant
 *
 * Provides student-focused answers for Mumbai transit, DJSCE campus navigation,
 * timetable management, and study planning.
 */

const { GoogleGenAI } = (() => {
  try {
    return require('@google/genai');
  } catch (e) {
    return { GoogleGenAI: null };
  }
})();

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

async function handleChat(req, res, next) {
  try {
    const { message, conversationHistory = [] } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey && GoogleGenAI) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const systemPrompt = `You are a helpful, smart student transit assistant for DJ Sanghvi College of Engineering (DJSCE) in Vile Parle West, Mumbai.
You provide concise, accurate commuting tips (Western line local trains, Metro 1/2A/3, BEST buses like A-422, shared autos) and college academic guidance.
Keep responses concise, friendly, and well-formatted with markdown bullet points.`;

        const response = await ai.models.generateContent({
          model: 'gemini-1.5-flash',
          contents: [
            { role: 'user', parts: [{ text: `${systemPrompt}\n\nStudent question: ${message}` }] }
          ]
        });

        const reply = response.text || generateLocalAnswer(message);
        return res.json({ reply, source: 'ai' });
      } catch (err) {
        console.warn('Gemini chat error, falling back to local knowledge base:', err.message);
      }
    }

    // Deterministic grounded assistant fallback
    const reply = generateLocalAnswer(message);
    return res.json({ reply, source: 'grounded-engine' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleChat
};

