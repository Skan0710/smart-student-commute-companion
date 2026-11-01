/**
 * AI Study Plan Controller
 *
 * Generates personalized, interactive study strategies based on explicit student parameters:
 * 1. Has exam (yes/no)
 * 2. Timeframe before exam (hours or days)
 * 3. Daily study capacity (hours/day)
 * 4. Sleep duration (hours/night, strictly preserved)
 * 5. Selected course/subject priorities
 */

const { success, badRequest } = require('../utils/apiResponse');

function generateLocalPlan({ hasExam, examTimeframe, dailyStudyHours, sleepHours, selectedSubjects }) {
  const subjectsStr = (selectedSubjects && selectedSubjects.length > 0)
    ? selectedSubjects.join(', ')
    : 'All Enrolled Courses';

  const isExam = hasExam === 'yes';
  const studyHours = Number(dailyStudyHours) || 4;
  const sleep = Number(sleepHours) || 7;

  return `### 🎯 Strategic Study Blueprint

**Target Goal:** ${isExam ? `High-Yield Exam Preparation (${examTimeframe || 'Upcoming'})` : 'Structured Semester Focus'}
**Subjects:** ${subjectsStr}
**Daily Study Capacity:** ${studyHours} hours per day
**Sleep Commitment:** ${sleep} hours per night (Strictly Non-Negotiable)

---

### 1. ⏱️ Daily Routine & Time Allocation
* **Morning Brain Window (1.5 hrs):** Dedicate to the most challenging conceptual topics in **${selectedSubjects[0] || 'Core Subject'}**. Cognitive alertness is highest after your full ${sleep} hours of restorative sleep.
* **Mid-Day Active Recall (1.5 hrs):** Solve practice problems, numericals, or coding implementations for **${selectedSubjects[1] || selectedSubjects[0] || 'Secondary Subject'}**.
* **Evening Wrap-up & Flashcards (${Math.max(1, studyHours - 3)} hr):** Summarize takeaways, review cheat sheets, and flag doubtful questions for tomorrow.

---

### 2. 📚 Subject-by-Subject Focus Strategy
${selectedSubjects.map((sub, i) => `* **${sub}:**
  - Focus 60% of time on high-weightage chapters and previous year questions (PYQs).
  - Create one-page formula / diagram cheat-sheets for rapid revision.
  - Test yourself with closed-book timed quizzes to solidify memory retention.`).join('\n\n')}

---

### 3. 🚆 Mumbai Commute Micro-Learning
* On the train (Western Line local) or BEST bus (e.g. A-422), avoid heavy textbook solving.
* Use transit time to:
  - Review saved PDF summary sheets on your phone.
  - Listen to 15-minute concept explainer podcasts or audio notes.
  - Review 20 flashcards on key definitions and formulas.

---

### 4. 🧠 Cognitive Health & Exam Day Preparedness
* **Preserve your ${sleep} hours of sleep:** Sleep is when the brain transfers facts from short-term memory to long-term synaptic retention. Pulling late nights directly reduces recall by up to 40%.
* **The 50/10 Rule:** Study in 50-minute focused blocks followed by a 10-minute break away from screens.
* **48 Hours Before Exam:** Stop learning brand new concepts; focus 100% on consolidating what you already know.`;
}

async function generateInteractivePlan(req, res, next) {
  try {
    const { hasExam, examTimeframe, dailyStudyHours, sleepHours, selectedSubjects } = req.body;

    if (!hasExam || !dailyStudyHours || !sleepHours) {
      return badRequest(res, 'Please answer all questions before generating your plan.');
    }

    let planContent = '';

    // Check if Groq API key is available
    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (groqKey) {
      try {
        const prompt = `You are an elite Academic Coach and Study Strategy Advisor for an engineering college student.
The student has provided the following study parameters:
- Upcoming Exam: ${hasExam === 'yes' ? `YES (Time remaining: ${examTimeframe || 'Few days'})` : 'NO (Regular semester coursework)'}
- Study Hours Per Day: ${dailyStudyHours} hours
- Sleep Duration: ${sleepHours} hours per night (MUST BE RESPECTED - do not suggest staying up late)
- Selected Subjects for Exam/Focus: ${(selectedSubjects || []).join(', ') || 'All active subjects'}

Generate an inspiring, deeply structured, and actionable study plan formatted in Markdown.
Guidelines:
1. Use bold text (**Title**) for headings and emphasis instead of plain asterisks.
2. Space out statements with line breaks and clear bullet points for readability.
3. Include:
   - Executive Summary & Timeline
   - Daily Time-Block Schedule (fitting their ${dailyStudyHours}h study and ${sleepHours}h sleep)
   - Subject-specific breakdown for each selected course
   - Mumbai transit / commute study tips
   - Final review and memory retention tactics
Do NOT output raw unbroken walls of text. Make it visually clean, well-spaced, and encouraging.`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey}`
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              {
                role: 'system',
                content: 'You are an expert academic advisor. Always format your responses in clear Markdown with bold headers, spaced paragraphs, and crisp bullet points.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.6,
            max_tokens: 1500
          })
        });

        if (response.ok) {
          const data = await response.json();
          planContent = data.choices?.[0]?.message?.content || '';
        }
      } catch (err) {
        console.warn('Groq study plan generation failed, falling back to local engine:', err.message);
      }
    }

    if (!planContent && geminiKey) {
      // If Gemini key is available and Groq wasn't used, try Gemini
      try {
        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `Create a personalized study plan for a student with: Exam: ${hasExam}, Time: ${examTimeframe}, Study: ${dailyStudyHours}h/day, Sleep: ${sleepHours}h, Subjects: ${(selectedSubjects || []).join(', ')}. Use clear headings, bold text, and spaced bullet points.`
        });
        planContent = response.text || '';
      } catch (e) {
        console.warn('Gemini study plan generation fallback:', e.message);
      }
    }

    if (!planContent) {
      planContent = generateLocalPlan({
        hasExam,
        examTimeframe,
        dailyStudyHours,
        sleepHours,
        selectedSubjects: selectedSubjects || []
      });
    }

    return success(res, {
      message: 'Personalized AI Study Plan generated',
      plan: {
        title: hasExam === 'yes' ? `Exam Sprint Plan (${examTimeframe || 'Upcoming'})` : 'Weekly Academic Mastery Plan',
        hasExam,
        examTimeframe: examTimeframe || '',
        dailyStudyHours,
        sleepHours,
        selectedSubjects: selectedSubjects || [],
        content: planContent,
        generatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  generateInteractivePlan
};

