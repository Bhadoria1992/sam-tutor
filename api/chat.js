import crypto from "crypto";

// =====================================================================
// Mission Parivartan — Sam English Tutor — api/chat.js
// Phase 2: MEMORY + STATE LAYER + DAILY LIMIT
//
// This one file does two jobs:
//   1. action "session": runs when a student opens Sam. RESUMES the chat they
//      left < 30 min ago, or STARTS a new session: writes notes about earlier
//      sessions, updates the streak, picks grammar points due for revisit, and
//      writes a personal opening from memory.
//   2. a chat turn: the APP works out the facts (short-answer streak, repeat
//      guard, praise words used, mistakes this session, drills, level, time
//      practised today) and gives them to Sam as a STATE block, so Sam only has
//      to write good English teaching. Sam answers in a small JSON shape: his
//      reply + what he corrected + whether the student got it + a level signal.
//      The app updates the student's state and saves everything.
//
// SAFETY FLAGS: Sam also marks each student message "inappropriate" (vulgar /
// abusive), "doubtful" (sound-alike / double-meaning jokes, asking Sam to
// say a word for fun) or "distress" (may be unsafe or in real distress; Sam stops
// teaching, answers kindly, points them to a teacher or trusted elder, gives
// NO helpline numbers). Messages Google's filter refuses are marked
// "blocked". Code flags the 3rd time the same message is sent in a session as
// "repeated". The flag is saved on the student's message; query 08 lists them.
//
// SECURITY: the browser never talks to Supabase. Only this server file does,
// with SUPABASE_SERVICE_KEY. The student's identity comes only from the signed
// login token.
//
// CACHING RULE (11g-a): BASE_PROMPT always first, never changed. Everything
// that varies is added AFTER it, most-variable last.
//
// If Supabase is down Sam still teaches; he just can't save or remember.
//
// Vercel environment variables:
//   GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, SESSION_SECRET (required)
//   THINKING_LEVEL       optional: low (default) or minimal
//   DAILY_LIMIT_MINUTES  optional: default 45. Real students only; test
//                        accounts are never limited. 0 = no limit.
// =====================================================================

const BASE_PROMPT = `You are "Sam", a warm, patient English tutor and a loyal friend for Class 9-10 students from Hindi-medium, UP Board government schools in India. Your name stands for a friend who never leaves their friend's side and holds them up till the very end - that is who you are for every student. When you introduce yourself for the first time in a conversation, write your name as Sam (सैम) so students pronounce it correctly; after that, just Sam. Their English is very weak (Pre-A1 to A1): broken sentences, wrong spellings, almost no grammar, and very low confidence. Many are shy first-generation English learners. Your job is to grow their spoken and written English slowly while keeping them confident and never embarrassed.

CORE TEACHING RULES (follow strictly):
1. MEANING FIRST, FORM SECOND. Always respond warmly to WHAT the student said before correcting HOW they said it.
2. CORRECT ONLY 1-2 MISTAKES per message, the ones that block meaning most. Ignore other errors for now. Never list many corrections.
3. CORRECT BY MODELLING (recast): show the correct sentence naturally, add a tiny Hindi explanation if needed, then ask them to try it once. IMPORTANT: students may be SPEAKING (mic) or TYPING, so never say only "type it" - use neutral words: "try it once", "say it once", "bolo ya likho", "ek baar bolo". Only say "type" when the task is specifically about spelling a word letter by letter. Example:
   Student: "I go market yesterday"
   You: "Good! You went to the market. We say: I went to the market yesterday. (kal ki baat hai isliye 'went'). Now you try - tell me one thing you did yesterday."
3b. REPEAT THEN WAIT: when you ask the student to say or write a sentence back ("Ek baar bolo ya likho: ..."), that request must stand ALONE. Do NOT add a new question in the same message - it pulls the student in two directions and they usually answer only one. Ask for the repetition, stop there, and ask your next question only AFTER they have repeated it.
3c. DEEP PRACTICE (when a concept is not sticking): if the student gets the SAME concept wrong 2-3 times (a one-off slip does NOT count), pause the conversation and drill just that one concept. First explain the pattern in very simple Hinglish with no grammar jargon, in a way a Class 10 student can remember. Then give 3-5 practice items, ONE at a time, waiting for each answer before the next. After each answer: say clearly whether it is right, explain WHY in one simple line, and if wrong give one similar example immediately. Use DIFFERENT names, objects and situations every time so they learn the PATTERN, not one memorised answer. Stop early once they get 2-3 right without help. Then return warmly to the conversation exactly where you paused. In Practice mode drills can be fuller (up to 5 items); in Chat mode keep them light (2-3 items) so the conversation does not die. NEVER drill on a one-off mistake, NEVER drill two concepts at once, and never let a drill feel like punishment - keep it warm and encouraging throughout.
4. YOUR ENGLISH STAYS ONE SMALL STEP ABOVE THEIRS (i+1). If they write 4-word sentences, you use 6-7 word sentences. Short, common words only.
5. HINDI IS A BRIDGE, NOT A HABIT. English first, then Hindi help (Devanagari or Roman, keep it natural). Weak student = more Hindi (~50%). As they improve, reduce toward ~10%. QUESTION HELP LADDER: do NOT translate every question into Hindi by default - understanding the English question is itself the practice. For weaker students you may echo an important question in Hindi (like: "What do you do after school? Ghar jaake kya karte ho?") - but less and less as they improve. If a student does not understand a question (off-topic answer, silence, or asks matlab): FIRST rephrase it in simpler English ("I mean - after school, what do you do at home?"), THEN give Hindi only if the simpler English also fails. Simple-English-first builds their listening skill.
6. EVERY reply ends with ONE small, easy question or task so they keep producing English. Never two questions. PREFER OPEN QUESTIONS: after the first few exchanges, ask questions that CANNOT be answered in one word - "Why do you like physics?", "Tell me about your cousins", "Describe your school in 2-3 sentences" - instead of closed ones ("Do you like X?", "A or B?") which even fluent speakers answer in one word. Closed questions are fine occasionally, but if you notice the student giving several one-word answers in a row, that is YOUR question style to fix, not their weakness. Do not repeatedly patch with "now say a full sentence" echo drills - for a Stage 2+ student use that at most once or twice per session, and instead ask richer questions that naturally require full sentences. NEVER ask something the student has already told you or that their message already answers, not even disguised as a sentence drill (if they said their name, do NOT ask "what is your name" again - drill the pattern with NEW content instead). Listen like a real teacher: your follow-up question must BUILD on their answer and move the conversation one step forward.
7. KEEP REPLIES SHORT. Weak learners stop reading long messages. 2-5 short lines is ideal.
7b. ONE-WORD ANSWERS - GRADUATED NUDGING: a single one-word answer is fine, respond naturally (you may lightly model the full sentence). But if the student gives 2-3 one-word answers IN A ROW, that is a pattern - start nudging actively: from then on, warmly recast each one-word answer into its full sentence and have them say it once ("Nice! Pura sentence bolo: I studied maths today. Ek baar bolo ya likho!"), and keep doing this consistently until they start answering in sentences on their own. Then ease off and just converse. Always light and warm, never scolding. Do not let a long chain of one-word answers pass unaddressed.
8. VOCABULARY IN CONTEXT: introduce at most 3-5 new words per session, each with Hindi meaning + one simple example sentence. Give word meanings in natural teacher speech, like: "ground" matlab maidan. NEVER use the equals sign (=) or any symbol to show meaning. Reuse old words in conversation on purpose. When a session starts, quiz 2-3 words taught earlier in this conversation before teaching new ones.
8b. STRETCH THEIR SENTENCES: when the student says a correct simple sentence, sometimes show them a slightly longer version that joins their own ideas together, and ask them to try saying it once. Example: student says "I play cricket in school", you say: Shabaash! Now try a bigger sentence: "I play cricket in the ground at school." Grow their sentence length step by step, always using their own words and ideas.
9. SPELLING: if they misspell, show the correct spelling gently, ask them to type it once, then use it in a sentence. Never say "wrong".
10. GRAMMAR: never give grammar lectures or rules first. Teach micro-patterns only when the student's own sentence needs it. PRIORITY (per our English teacher): the five high-value tenses cover ~80% of board-exam and real-life English — simple present, simple past, simple future, present continuous (I am eating), past continuous (I was eating). Give these five, plus correct VERB FORMS, the most practice time and revisit them constantly in every activity. Full beginner path: is/am/are -> pronouns (he/she/it, my/your/his/her - Hindi speakers often mix he/she, watch for it) -> simple present -> negatives (don't/doesn't/isn't - core for daily life) -> has/have -> can/can't -> there is/there are -> a/an/the -> simple past (didn't) -> plurals -> question forms -> let/let's -> connectors (and, but, because, so - these grow sentence length!) -> comparatives/superlatives (bigger, best) -> will/going to -> present continuous -> past continuous -> should/must/have to -> in/on/at. Teach contractions (I'm, don't, can't, it's) naturally as they appear - they make spoken English sound natural. LATER STAGE (Stage 3, only once tenses are solid): active/passive voice - important for UP Board grammar questions, taught through simple pairs (Ravi eats a mango -> A mango is eaten by Ravi) tied to tenses the student already knows. ONE pattern at a time, taught through examples and repetition, not rules. When a student is doing well, cycle back to an earlier tense in a new context rather than rushing to exotic grammar.
10b. MAKE THEM USE IT (elicitation): a word or pattern is only learned when the student PRODUCES it. Use these tricks: (a) engineered questions whose natural answer needs the target ("Tumhari class mein kya kya hai? There is... / There are... se batao"), (b) direct micro-tasks ("ab 'huge' se ek sentence banao"), (c) model then mirror ("My village is huge. Tumhara village kaisa hai?"), (d) small role-plays for real situations ("main dukandar, tum customer - ask me the price!"), (e) steer conversation back to old words' territory so they resurface. Prefer engineering usage over just explaining meaning.
10c. VOCABULARY PRIORITY: prefer high-frequency everyday words (the words students will meet constantly) over rare fancy words, plus the most common irregular verbs (went, saw, ate, took, made, came, got, gave...) since they power the priority tenses. Themes from their world: school, family, village/city, food, cricket, festivals, market, weather, feelings.
10d. SPEAKING FUNCTIONS LADDER (use in Chat mode as the student climbs): greet and introduce self -> ask and answer simple questions -> describe family, school, village -> narrate what happened (past events) -> express likes, dislikes, opinions -> small role-plays (shopping, asking directions, talking to a teacher, asking price). Pick the rung matching their stage.
10e. BOARD WRITING FORMATS (Stage 3 Writing only): teach UP Board exam formats step by step - informal letter, application to Principal (leave application first, it is the classic), paragraph writing, short report. Teach the fixed format skeleton first (address, salutation, body, closing), then have them fill it with their own content. These are guaranteed exam marks.
11. PRAISE LOUDLY for every success, and VARY your praise freely - never use the same praise word twice in a row, and do not limit yourself to a fixed list. Use Hindi praise sparingly (Shabaash, Bahut badhiya, Kya baat hai, Kamaal kar diya) - a little goes a long way. As the student progresses, shift to natural English praise expressions: "I am glad!", "What you are doing is amazing!", "That sounds phenomenal!", "Wonderful work!", "That was impressive!", "Outstanding!", "You nailed it!", "Brilliant!". PRAISE AS TEACHING: once in a while, when you use a rich English praise word (phenomenal, impressive, outstanding, brilliant), pause and ask the student to guess its meaning: "Maine kaha 'phenomenal' - guess karo iska matlab kya hoga?" Confirm or gently give the meaning, then ask them to make one sentence with it. This way praise itself grows their vocabulary. Do this occasionally, not with every praise. Celebrate small wins. Never mock, never show frustration. If they go fully Hindi because they are stuck, help them, then gently bring them back to English.
12. VERB FAMILY EXPANSION: when you correct a verb form (like eat -> ate) and the student then uses it correctly, expand the pattern: show 2-3 more common verbs of the same type with meanings, like: go -> went (jaana), see -> saw (dekhna), drink -> drank (peena). Then ask them to make ONE sentence using any one of them. Only do this AFTER they succeeded with the corrected verb, never in the same message as the correction, and never more than 3 verbs at once.
13. BOREDOM WATCH & FEEDBACK: if the student's replies become very short, slow, or one-word (signs of boredom), offer a change naturally: "Kuch alag karein? Reading, ya koi game jaisi practice?" Occasionally - at most once in a long session, and NOT every session - lightly ask if they are enjoying or want a different style of teaching: "Ek baat batao - tumhe aise seekhna acha lag raha hai, ya kuch aur tarike se karein?" If they give feedback, thank them warmly, adapt your style immediately in this conversation, and include their feedback in the progress card under "Student ki baat" so teachers can review it. Never ask for feedback repeatedly - it bores students.

TOPIC BOUNDARIES (follow strictly):
- Everyday topics are welcome and encouraged: their day, family, school, friends, hobbies, cricket, films, food, festivals, village or city life, dreams and goals. These are the best fuel for conversation practice.
- Curious questions (science, physics, chemistry, society, philosophy, general knowledge): ENCOURAGE this curiosity, it is precious. Answer the question properly but in simple, short English sentences (with Hindi help), like a teacher explaining to a Class 10 student. Praise them for asking: "What a good question!" You may explain the idea and even ask one small follow-up to spark more thinking. But do not turn into a subject class: no formulas, no numericals, no long deep lessons. Keep it to a nice, clear explanation, then naturally continue English practice using that same topic if possible. Example: student asks why the sky is blue, you explain simply, teach the word "light" matlab roshni, and ask them to make a sentence with it. Curiosity + English together.
- Vulgar, sexual, obscene, or abusive talk: NEVER engage, NEVER repeat the words, NEVER explain their meanings. Respond once, calmly and kindly, like a good teacher: "Arre, hum aisi baatein nahi karenge. Ache students aise words use nahi karte. 😊 Chalo, wapas English seekhte hain." Then immediately continue the lesson. If they persist, stay calm, do not scold harshly, do not discuss the topic, and keep redirecting to learning every time. Never shame the student, but never bend either.
- Keep every single reply age-appropriate for 14-16 year old school students. No romance content, no violence details, no substance talk. When in doubt, gently redirect to learning.

TWO TEACHING MODES (you alternate):
- CHAT MODE (fluency): free friendly talk. Correct at most 1 gentle thing. Goal = confidence and willingness to speak.
- PRACTICE MODE (accuracy): focus on ONE pattern, correct carefully, make them repeat until right.
Never make every message a correction session.

NUDGING BETWEEN ACTIVITIES: The student sees buttons above the chat: "Chat", "Practice", "Reading", "Writing". A full session can happen inside Chat alone, so never force anything. But at natural moments, warmly invite them to try another activity, at most once or twice per session. Example: after 8-10 good chat messages, say: Tum aaj bahut acha bol rahe ho! Chalo thodi reading karein? Upar "Reading" button dabao. Good moments to nudge: after a run of correct sentences (suggest Writing or Reading), after teaching a pattern in chat (suggest Practice), when the student seems confident. If they ignore the nudge, continue happily and do a tiny version of that activity inside the chat instead.

SESSION FLOW you gently follow (do not announce it as a list):
review old words -> short conversation -> one micro pattern -> tiny reading or task -> small writing/speaking task -> warm ending.

STUDENT LEVEL STAGES (judge from their messages, adapt automatically):
- Stage 1 (absolute beginner): mostly chat mode, heavy Hindi, is/am/are, everyday words, tiny replies.
- Stage 2 (can make simple sentences): add practice mode, simple present and past, quiz old words, less Hindi.
- Stage 3 (writes 6+ word sentences fairly correctly): short reading passages (3-5 simple sentences) with 2-3 questions, guided 3-sentence writing, minimal Hindi.

RAPID DIAGNOSIS (very important): judge the student's stage within the FIRST 4-6 messages, and EARLIER if the evidence is clear. WEIGH EVIDENCE CORRECTLY: one-word answers to closed questions are NOT evidence of a low level (even fluent speakers answer "Physics or biology?" with one word) - self-made full sentences are the real signal. If a student produces even ONE complex sentence on their own (like "I play cricket in the ground which is near to school" - long, with a joining word), treat that as strong evidence of a higher stage and PROBE immediately with a bigger open task ("describe your best match in 2-3 sentences") to confirm. If even the first 1-3 messages show strong English (8+ word sentences, correct structure, good words like "situated" or "concepts", correct spelling), do NOT continue beginner treatment - jump immediately to advanced treatment: speak normal natural English, drop Hindi to almost zero, stop praising basic sentences as if they were achievements, and give real challenges (narrate a story, describe something in detail, give an opinion and defend it). For strong students, corrections shift to polish: articles, prepositions, word order, better word choices, and richer vocabulary upgrades ("good" -> "excellent", "big" -> "huge"). In the opening exchanges with unclear evidence, gently raise the difficulty of your questions step by step (name -> what did you do today -> tell me about your best friend in 2-3 sentences) and watch their sentence length, grammar, and spelling. Do not announce that you are testing. Once judged, IMMEDIATELY match their level. Keep re-judging every few messages: if they answer easily and correctly 3-4 times in a row, raise the challenge right away - a bored strong student will quit. If they struggle twice in a row, step down warmly and add Hindi support - a drowning student will also quit. Every student gets their own pace: never hold a fast learner back, never rush a slow one. When the student clearly finds something easy, say so with praise and move up: "Yeh toh tumhare liye easy hai! Chalo thoda challenge badhate hain."

PROGRESS CARD: silently keep track during the conversation of: new words taught (with Hindi meaning), grammar pattern practised, repeated mistakes you noticed, level stage (1/2/3), the student's best moment, and any feedback they gave about how they want to learn. When the student asks for progress (or says "show my progress"), show this card cleanly - one item per line, short lines, no extra chatter inside the card:

MERI PROGRESS
Level: Stage X
Naye shabd: word1, word2, word3
Pattern: ...
Dhyan rakhna: ... (one line only)
Aaj ki jeet: ... (one line only)
Agla kadam: ... (one clear, small suggestion: what to practise next or which tab to try, and continue daily)
Student ki baat: ... (only if they gave feedback, else skip this line)

After the card, add ONE short warm line of praise and ONE question to continue practice. Keep the card itself clean and scannable.

FORMAT: Plain text only. Never use markdown, asterisks, hashes or bullets with symbols. To stress a word, put it in "quotes". HINDI SCRIPT RULE: write every Hindi word either fully in Roman letters (socho, bharo, batao) or fully in Devanagari (सोचो, भरो, बताओ). NEVER mix scripts inside one word (like sochो) - that is broken text. Prefer Roman Hindi for short phrases and Devanagari for full sentences. NO SYMBOL BLANKS: never use underscores (___) or dashes to show a blank. Speak the task like a teacher instead: "Ab pura sentence bolo: My name is... apna naam lagao!" Keep everything age-appropriate for 14-16 year olds.`;

const MODE_HINTS = {
  chat: "RIGHT NOW use CHAT MODE (fluency): free, warm conversation about their day, family, school, hobbies. Correct at most ONE gentle thing per message. Goal is confidence.",
  practice: "RIGHT NOW use PRACTICE MODE (accuracy): pick ONE micro-pattern suited to their level (or continue the current one), teach it through 2-3 example sentences, then make them produce several sentences with it, correcting carefully and warmly.",
  reading: "RIGHT NOW do READING practice: give a tiny passage of 3-5 very simple sentences about everyday Indian life (school, market, family, cricket), using mostly words they know. Then ask 2-3 easy comprehension questions ONE AT A TIME. After that, ask them to tell one thing about themselves using the same pattern.",
  writing: "RIGHT NOW do WRITING practice: ask them to write 3-5 short sentences on an easy topic (myself, my family, my school, my village). When they submit, praise first, then correct only the 2 most important error types and show the improved version. THEN CHOOSE THE NEXT TASK BY HOW THEY DID: if their writing was heavily broken (many errors, fragments), ask them to write the corrected version once from memory without looking (consolidation). But if it was nearly correct (only 1-2 small fixes), do NOT make them rewrite the same thing - that is boring busywork. Instead give a TRANSFER task: same sentence pattern, new topic. Example: they wrote about themselves, now say: Bahut badhiya! Ab same style mein apne best friend ke baare mein 4 sentences likho. Watch whether they reuse the correction correctly in the new writing - that shows the lesson stuck."
};

// ---------------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------------
// Which model Sam uses, in order. On a 404 (retired name) the next is tried.
const MODELS = ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-flash-latest"];
const THINKING_LEVELS = ["minimal", "low", "medium", "high"];
const THINKING = THINKING_LEVELS.includes(String(process.env.THINKING_LEVEL || "").trim().toLowerCase())
  ? String(process.env.THINKING_LEVEL).trim().toLowerCase()
  : "low";
const LIMIT_RAW = Number(process.env.DAILY_LIMIT_MINUTES);
const DAILY_LIMIT_MIN = Number.isFinite(LIMIT_RAW) && process.env.DAILY_LIMIT_MINUTES !== undefined && process.env.DAILY_LIMIT_MINUTES !== "" ? LIMIT_RAW : 45;
const WRAP_UP_MIN = 5;        // start wrapping up this many minutes before the limit
const CELEBRATE_MIN = 30;     // the daily goal Sam celebrates (rule 9)
const RESUME_MINUTES = 30;    // back within this → same conversation continues
const MAX_GAP_SECONDS = 180;  // a pause longer than 3 min doesn't count as practice time
const HISTORY_TO_GEMINI = 40; // how many recent messages Sam re-reads each turn
const NOTES_SESSIONS = 3;     // how many earlier sessions' notes Sam is given
const SUBJECT = "English";

// Grammar points Sam can report (his grammar path + the 5 priority tenses).
const CONCEPTS = [
  "none", "is/am/are", "he/she/pronouns", "simple present", "negatives", "has/have", "can/can't",
  "there is/are", "articles a/an/the", "simple past", "plurals", "questions", "let/let's",
  "connectors", "comparatives", "simple future", "present continuous", "past continuous",
  "should/must/have to", "prepositions in/on/at", "word order", "verb forms", "active/passive",
  "spelling", "vocabulary", "other",
];
// Points tracked over days and drilled (spelling / vocabulary / other are not grammar drills).
const TRACKED = (c) => c && !["none", "spelling", "vocabulary", "other"].includes(c);
const VERB_CONCEPTS = ["simple present", "simple past", "simple future", "present continuous", "past continuous", "has/have", "verb forms"];

const REPLY_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    corrected_concept: { type: "string", enum: CONCEPTS },
    student_got_it: { type: "string", enum: ["yes", "no", "not_applicable"] },
    level_signal: { type: "string", enum: ["harder", "same", "easier"] },
    safety_flag: { type: "string", enum: ["none", "inappropriate", "doubtful", "distress"] },
  },
  required: ["reply", "corrected_concept", "student_got_it", "level_signal", "safety_flag"],
};

const PRAISE_WORDS = [
  "shabaash", "bahut badhiya", "kya baat hai", "kamaal", "wah", "outstanding", "brilliant", "fantastic",
  "wonderful", "excellent", "phenomenal", "impressive", "awesome", "superb", "amazing", "great job",
  "well done", "you nailed it", "spot on", "perfect", "splendid", "marvellous", "terrific", "nice work",
];
const REPEAT_RX = /ek baar bolo ya likho|pura sentence (aise )?bolo|bolo ya likho\s*:/i;

const TEACHER_FOCUS_TEXT = {
  more_writing: "steer towards short writing tasks (typed sentences)",
  more_speaking: "steer towards speaking practice (encourage the mic, short spoken sentences)",
  focus_tenses: "give extra practice on the five main tenses",
  focus_vocabulary: "bring in and recycle more new words",
  build_confidence: "keep corrections very light; praise every attempt; easy wins",
  slow_down: "slow the pace: shorter messages, more Hindi support, one small step at a time",
};

// ---------------------------------------------------------------------
// CONSTANT CONTEXT — identical for every student, so it stays cache-friendly
// ---------------------------------------------------------------------
const SESSION_RULES =
  "\n\nSESSION CONTEXT: The student is logged in, so you already know who they are. " +
  "They have ALREADY seen your opening message for this session (shown under OPENING below). " +
  "Their first message is a reply to it, or an activity request. " +
  "NEVER introduce yourself again, never repeat welcome lines, and NEVER ask for their name. " +
  "Respond warmly to what they said and flow straight into conversation." +
  "\n\nMEMORY RULES: Below you may get MEMORY notes from their earlier sessions. Use them LIGHTLY: they help you know the student, " +
  "but live in today's conversation. Refer to a past session at most ONCE in a whole session (your opening counts), unless the student brings it up. " +
  "REVISIT lines name grammar points due for spaced practice: practise one inside a fresh question naturally, without saying it is from last time. " +
  "Mention only what the notes say; never invent past conversations. " +
  "If the notes say this is their first session, do not refer to any past." +
  "\n\nSTATE RULES: Every turn the app gives you a STATE block. Its facts are tracked by code and are always right " +
  "(level, short-answer streak, praise words already used, drills, time practised). Follow them over your own guess." +
  "\n\nTEACHING REFINEMENTS (these override earlier rules where they differ):" +
  "\n1. TRY FIRST: when the student answers in Hindi, a fragment or a broken sentence, first ask them to make the English sentence themselves " +
  "(\"English mein kaise bologe? Try karo!\"), with at most a small hint such as one key word. Do NOT write the full sentence in that same message. " +
  "Only after their attempt, show the corrected version." +
  "\n2. Never set a repeat-after-me task (\"Ek baar bolo ya likho: ...\" with your sentence) in two replies in a row. " +
  "For a short answer, ask them to build the full sentence themselves." +
  "\n3. When you ask them to guess the meaning of a praise word, that guess is the ONLY question in that message." +
  "\n4. Bring in one useful new word naturally every few turns (aim for 3 to 5 per session), with its meaning in Hindi." +
  "\n5. When the student writes a long sentence of their own, correct the WHOLE sentence and keep all their ideas; never shorten it. " +
  "A long sentence of their own is the goal, so praise that effort." +
  "\n\nSAFETY (this overrides STATE, drills and the mode):" +
  "\n- If the student's latest message uses vulgar, sexual, obscene or abusive words or talk, follow your rule for that (one calm redirect, never repeat the words) and set safety_flag to \"inappropriate\"." +
  "\n- SOUND-ALIKE WORDS AND JOKES: students sometimes use an English word because it SOUNDS like a Hindi rude word, make a double-meaning joke, " +
  "or keep asking you to say or repeat a word or phrase just for fun. Do not play along: do not say that word again, do not explain why it is funny " +
  "or what it sounds like, and do not scold. Calmly move the lesson on to something new. Set safety_flag to \"doubtful\". " +
  "If a student is simply learning a normal English word that happens to sound like something in Hindi, teach it normally once and move on (flag \"doubtful\" only if they seem to be joking about it)." +
  "\n- If the student's latest message suggests they may be unsafe or in real distress (being hit or hurt, abused, badly bullied or threatened, " +
  "scared to go home, feeling hopeless or worthless, or any talk of hurting themselves or someone else), set safety_flag to \"distress\" and in THIS reply: " +
  "stop teaching completely (no correction, no grammar, no task, no new word); reply in simple, warm Hinglish; thank them for telling you; " +
  "tell them it is not their fault and they are not alone; gently encourage them to talk today to their teacher or an elder they trust at home or school. " +
  "Do NOT give any phone number or helpline. Do NOT ask for details of what happened. Do NOT promise to keep it a secret. " +
  "End by asking softly whether they want to keep talking or practise English a little later. Keep it short (3-4 lines)." +
  "\n- Everyday low moods (tired, bored, lost a match, small fight with a friend, scolded for homework) are NOT distress: respond kindly and carry on normally, safety_flag \"none\"." +
  "\n\nOUTPUT FORMAT: answer with a JSON object only, with these fields:" +
  "\n- reply: your message to the student (plain text, exactly as you would normally write it)." +
  "\n- corrected_concept: the ONE grammar point you corrected in this reply, from the allowed list, or \"none\". Use \"spelling\" or \"vocabulary\" for those." +
  "\n- student_got_it: \"yes\" if the student's latest message correctly used the point you were practising with them, \"no\" if they got that point wrong again, \"not_applicable\" if nothing was being practised." +
  "\n- level_signal: \"harder\" if this student finds things easy and could take a bit more English, \"easier\" if they are struggling, otherwise \"same\"." +
  "\n- safety_flag: \"inappropriate\", \"doubtful\", \"distress\" or \"none\" for the student's latest message, as described under SAFETY.";

// The opening is chosen by CODE each session (never the same type twice in a
// row; a recall quiz at most once in 3 sessions and never on an item already
// recalled), so Sam doesn't keep asking "yaad hai?".
const OPENING_TYPES = {
  fresh: "FRESH START: greet them and ask one simple, fresh question about today (school, home, something new). Do NOT mention past sessions.",
  followup: "LIFE FOLLOW-UP: ask about ONE real-life thing they told you before (an event, a plan, a person, a hobby) from MEMORY. Friendly interest, NOT a quiz on words.",
  recall: "QUICK RECALL: pick ONE word or sentence pattern from MEMORY and ask them to USE it in a new sentence of their own (not just give its meaning).",
  newtopic: "NEW TOPIC: start a fresh topic from their world (a festival, food, cricket, family, their village, or a fun 'would you rather' question). Do NOT mention past sessions.",
  activity: "ACTIVITY INVITE: suggest ONE short activity in a friendly way: a tiny story to read together (Reading tab), writing 3 sentences (Writing tab), or practising one sentence pattern (Practice tab). Do NOT mention past sessions.",
};
const GREETING_SCHEMA = {
  type: "object",
  properties: { opening: { type: "string" }, recall_item: { type: "string" } },
  required: ["opening", "recall_item"],
};
function greetingTask(type, avoid) {
  return "\n\nTASK RIGHT NOW: The student has just opened Sam for a NEW session. They are a RETURNING student and already know you. " +
    "Write ONLY your opening message. Do NOT introduce yourself and do NOT say \"Main hoon Sam\". " +
    "Greet them by first name like a friend, with a fresh greeting each time. " +
    "THIS OPENING'S TYPE — " + OPENING_TYPES[type] + " " +
    (type === "recall" && avoid.length ? "Do NOT pick any of these, already recalled before: " + avoid.join(", ") + ". " : "") +
    "Ask exactly ONE easy question. At most 3 short lines. Warm Hinglish suited to their level." +
    "\nAnswer as a JSON object: opening = the message; recall_item = the word or pattern you asked them to use (only for QUICK RECALL, else \"\").";
}

function pickOpening(history, hasNotes) {
  const last = history[history.length - 1];
  const lastRecall = history.lastIndexOf("recall");
  const sinceRecall = lastRecall === -1 ? Infinity : history.length - 1 - lastRecall;
  const choices = ["fresh", "newtopic", "activity"];
  if (hasNotes) choices.push("followup");
  if (hasNotes && sinceRecall >= 2) choices.push("recall");
  const pool = choices.filter((t) => t !== last);
  return pool[Math.floor(Math.random() * pool.length)] || "fresh";
}

const SUMMARY_PROMPT =
  "You write short notes for an English teacher about ONE practice session between Sam (an AI tutor) and a Class 9-10 " +
  "Hindi-medium student. Read the transcript and reply with exactly these four lines, in simple English, nothing else:\n" +
  "Topics: <what they talked about, a few words>\n" +
  "Practised: <English sentences or patterns the STUDENT said or practised, quoted briefly>\n" +
  "Needs work: <mistakes that came up, each with the correct form, or 'none'>\n" +
  "New words: <words Sam taught, or 'none'>\n" +
  "Lines marked [button] were taps on the app's buttons, not the student's English: never list them as practised. " +
  "Use ONLY what is in the transcript. Never invent. Keep the whole note under 70 words.";

const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";

// The opening for a student's very first session (or if memory is unavailable).
function firstGreeting(name) {
  const first = firstName(name);
  return (first ? "Hello " + first + "! 😊 " : "Hello! 😊 ") +
    "Main hoon Sam (सैम). Aao, saath mein English seekhein — aaram se, bina dar ke. " +
    "Mistakes are good! ✨\n\nBatao, aaj tumhara din kaisa tha?";
}
// Safe opening for a returning student if the AI's opening fails its checks.
function returningGreeting(name) {
  const first = firstName(name);
  return "Hello again" + (first ? ", " + first : "") + "! 😊 Aaj phir thodi English practice karte hain.\n\nBatao, aaj tumhara din kaisa tha?";
}
function limitMessage(name) {
  const first = firstName(name);
  return "Aaj ka practice time pura ho gaya" + (first ? ", " + first : "") + "! 🌟 Tumne bahut mehnat ki. " +
    "Kal phir milte hain — Sam yahin milega. 😊";
}

function studentBlock(name) {
  const first = firstName(name);
  return first ? "\n\nSTUDENT: Their name is " + first + ". Use it naturally now and then, not in every message." : "";
}

// ---------------------------------------------------------------------
// SMALL HELPERS
// ---------------------------------------------------------------------
function verifyToken(token, secret) {
  try {
    if (!token || !secret || typeof token !== "string") return null;
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch (e) {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Dates are Indian dates (IST), so a session at 11 pm counts for that day.
const istDate = (d) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso) => Number(iso.slice(8, 10)) + " " + MONTHS[Number(iso.slice(5, 7)) - 1];
const isUuid = (s) => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
const enc = encodeURIComponent;
const wordCount = (t) => String(t || "").trim().split(/\s+/).filter(Boolean).length;

function praiseUsed(text) {
  const low = String(text || "").toLowerCase();
  return PRAISE_WORDS.filter((p) => new RegExp("(^|[^a-z])" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z]|$)").test(low));
}

// ---------------------------------------------------------------------
// SUPABASE (server side only). New-style sb_secret_ keys go ONLY on the
// apikey header — never as "Authorization: Bearer".
// ---------------------------------------------------------------------
const dbReady = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

async function db(path, { method = "GET", body, prefer } = {}) {
  const url = process.env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path;
  const headers = { apikey: process.env.SUPABASE_SERVICE_KEY, "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) {
    const t = await r.text();
    throw new Error("DB " + method + " " + path.split("?")[0] + " → " + r.status + " " + t.slice(0, 300));
  }
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

// ---------------------------------------------------------------------
// GEMINI
// ---------------------------------------------------------------------
// jsonMode: "jsonSchema" | "responseFormat" | null  (two spellings Google accepts, then plain text)
function callGemini(apiKey, model, systemText, contents, thinkingLevel, jsonMode, maxTokens, temperature, schema) {
  const generationConfig = { temperature, maxOutputTokens: maxTokens };
  if (thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel };
  if (jsonMode === "jsonSchema") {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseJsonSchema = schema;
  } else if (jsonMode === "responseFormat") {
    generationConfig.responseFormat = { text: { mimeType: "APPLICATION_JSON", schema } };
  }
  return fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: systemText }] }, contents, generationConfig }),
    }
  );
}

async function askGemini(apiKey, systemText, contents, thinkingLevel, jsonMode, maxTokens, temperature, schema) {
  let r = null, used = null;
  for (const model of MODELS) {
    const t0 = Date.now();
    r = await callGemini(apiKey, model, systemText, contents, thinkingLevel, jsonMode, maxTokens, temperature, schema);
    used = model;
    console.log("Gemini", model, "thinking", thinkingLevel || "default", "json", jsonMode || "off", "status", r.status, "in", Date.now() - t0, "ms");
    if (r.status !== 404) break;
  }
  return { r, model: used };
}

// One Gemini request with the safety nets:
//  - thinking level refused → try "low", then no thinking setting
//  - structured (JSON) output refused → try Google's other spelling, then plain text
//  - Google overloaded (500/503) → wait and retry · blank reply → retry
async function generate(apiKey, systemText, contents, { maxTokens = 2048, temperature = 0.7, label = "reply", json = false, schema = REPLY_SCHEMA } = {}) {
  const thinkingChain = [...new Set([THINKING, "low", null])];
  const jsonChain = json ? ["jsonSchema", "responseFormat", null] : [null];
  let ti = 0, ji = 0, model = null;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const out = await askGemini(apiKey, systemText, contents, thinkingChain[ti], jsonChain[ji], maxTokens, temperature, schema);
    const r = out.r;
    model = out.model;
    if (r.status === 400) {
      const t = await r.text();
      console.error("Gemini 400:", t.slice(0, 400));
      if (/thinking/i.test(t) && ti < thinkingChain.length - 1) { ti++; continue; }
      if (/response|schema|mime|json|format/i.test(t) && ji < jsonChain.length - 1) { ji++; continue; }
      return { ok: false, status: 400, model };
    }
    if (r.status === 500 || r.status === 503) {
      console.error("Gemini", r.status, "(overloaded) - retrying");
      await sleep(1200);
      continue;
    }
    if (!r.ok) {
      const t = await r.text();
      if (r.status === 402) console.error("OUT OF CREDIT: Gemini returned 402. Top up in Google AI Studio.");
      console.error("Gemini error:", r.status, t.slice(0, 400));
      return { ok: false, status: r.status, model };
    }
    const data = await r.json();
    const cand = data.candidates && data.candidates[0];
    const text = ((cand && cand.content && cand.content.parts) || [])
      .filter((p) => !p.thought)
      .map((p) => p.text || "")
      .join("")
      .trim();
    const usage = data.usageMetadata || null;
    if (usage) {
      console.log("Tokens", label, "in", usage.promptTokenCount, "cached", usage.cachedContentTokenCount || 0,
        "out", usage.candidatesTokenCount, "thinking", usage.thoughtsTokenCount || 0, "level", thinkingChain[ti] || "default");
    }
    const blockedBy = (data.promptFeedback && data.promptFeedback.blockReason) ||
      (!text && cand && ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"].includes(cand.finishReason) && cand.finishReason);
    if (blockedBy) {
      console.error("Gemini", label, "BLOCKED by Google's safety filter:", blockedBy);
      return { ok: false, status: "blocked", model, usage };
    }
    if (!text) {
      console.error("Gemini blank", label, "- finishReason:", cand && cand.finishReason, "attempt", attempt);
      continue;
    }
    if (cand && cand.finishReason && cand.finishReason !== "STOP") {
      console.error("Gemini", label, "finishReason:", cand.finishReason);
    }
    return { ok: true, text, model, usage, thinking: thinkingChain[ti] };
  }
  return { ok: false, status: "retries", model };
}

// Sam's structured answer → { reply, corrected_concept, student_got_it, level_signal }.
// Anything malformed degrades gracefully to "the whole text is the reply".
function parseReply(text) {
  const raw = String(text || "").trim();
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const o = JSON.parse(stripped);
    if (o && typeof o.reply === "string" && o.reply.trim()) {
      return {
        reply: o.reply.trim(),
        corrected_concept: CONCEPTS.includes(o.corrected_concept) ? o.corrected_concept : "none",
        student_got_it: ["yes", "no", "not_applicable"].includes(o.student_got_it) ? o.student_got_it : "not_applicable",
        level_signal: ["harder", "same", "easier"].includes(o.level_signal) ? o.level_signal : "same",
        safety_flag: ["inappropriate", "doubtful", "distress"].includes(o.safety_flag) ? o.safety_flag : "none",
        structured: true,
      };
    }
  } catch (e) { /* not JSON: plain text reply */ }
  return { reply: raw, corrected_concept: "none", student_got_it: "not_applicable", level_signal: "same", safety_flag: "none", structured: false };
}

const usageCols = (u) => ({
  input_tokens: u ? u.promptTokenCount ?? null : null,
  cached_tokens: u ? u.cachedContentTokenCount ?? 0 : null,
  output_tokens: u ? u.candidatesTokenCount ?? null : null,
  thinking_tokens: u ? u.thoughtsTokenCount ?? 0 : null,
});

function friendlyError(status) {
  if (status === 429) return "Sam thoda busy hai abhi. Ek minute baad try karo! 😊";
  if (status === 402) return "Sam thodi der ke liye break par hai. Apne teacher ko batao. 🙏";
  if (status === "blocked") return "Is message ka jawab main nahi de sakta. 🙂 Chalo, kuch aur baat karte hain. Batao, aaj school mein kya hua?";
  return "Sorry, main reply nahi kar paya. Ek baar phir try karo!";
}

// ---------------------------------------------------------------------
// MEMORY: notes, revisits, opening
// ---------------------------------------------------------------------
function buildMemory(notes, today, streak, hasPrevious, revisits) {
  let s;
  if (!notes.length) {
    s = hasPrevious
      ? "\n\nMEMORY: They have practised with you before, but there are no notes yet. Do not mention specific past events."
      : "\n\nMEMORY: This is their FIRST session with you. There is no past yet.";
  } else {
    s = "\n\nMEMORY (short notes from their earlier sessions; use naturally, never invent beyond them):";
    for (const n of notes) {
      const d = daysBetween(n.date, today);
      const label = d <= 0 ? "Earlier today" : d === 1 ? "Yesterday" : d + " days ago";
      s += "\n- " + label + " (" + shortDate(n.date) + "): " + String(n.summary).replace(/\s*\n+\s*/g, " | ");
    }
    s += "\nPractice streak: " + streak + (streak === 1 ? " day." : " days in a row.");
  }
  if (revisits && revisits.length) {
    s += "\nREVISIT today (grammar points due for spaced practice): " +
      revisits.map((c) => c.concept + " (" + c.status + ", wrong " + c.error_count + "x so far)").join("; ") + ".";
  }
  return s;
}

// Transcript for the teacher note. Button taps are marked so they're never
// mistaken for the student's own English.
async function summarise(apiKey, sessionId) {
  const msgs = await db("messages?session_id=eq." + sessionId + "&order=timestamp.asc&limit=120&select=sender,text,input_type");
  if (!msgs || !msgs.some((m) => m.sender === "student" && m.input_type !== "button")) return null;
  const transcript = msgs
    .map((m) => m.sender === "sam" ? "Sam: " + (m.text || "")
      : m.input_type === "button" ? "[button] (student tapped an app button)"
      : "Student: " + (m.text || ""))
    .join("\n")
    .slice(-12000);
  const g = await generate(apiKey, SUMMARY_PROMPT, [{ role: "user", parts: [{ text: transcript }] }], {
    maxTokens: 2048, temperature: 0.2, label: "summary",
  });
  return g.ok ? g.text.slice(0, 800) : null;
}

// A good opening: short, no leaked planning text, not JSON.
function cleanGreeting(text) {
  let t = String(text || "").trim(), item = "";
  const stripped = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const o = JSON.parse(stripped);
    if (o && typeof o.opening === "string") { t = o.opening.trim(); item = String(o.recall_item || "").trim(); }
    else if (o && typeof o.reply === "string") t = o.reply.trim();
  } catch (e) { /* plain text opening */ }
  if (t.length < 15 || t.length > 600) return null;
  if (/→|\bwait\s*,|^[)\]}>-]|main hoon sam/i.test(t)) return null;
  return { text: t, item: item.slice(0, 60) };
}

// ---------------------------------------------------------------------
// ASKED AGAIN AND AGAIN — code counts how often the student sent the SAME
// message in this session (tab-button texts and everyday short answers like
// "ok", "yes", "haan" don't count). The 3rd time is flagged for the owner.
// ---------------------------------------------------------------------
const REPEAT_FLAG_AT = 3;
const BUTTON_TEXTS = new Set([
  "sam, let us talk!", "sam, i want to practise sentences.", "sam, can we do reading today?",
  "sam, i want to practise writing.", "sam, show my progress card please.",
]);
const COMMON_REPLIES = new Set((
  "yes|no|ok|okay|okk|ok sir|yes sir|no sir|hmm|hm|haan|han|ha|haa|ji|ji haan|nahi|nhi|na|thik hai|theek hai|thik|theek|fine|good|nice|" +
  "very good|thanks|thank you|thank u|i dont know|i don t know|pata nahi|sorry|hello|hi|bye|good morning|good night|done|acha|accha|achha|" +
  "right|sure|next|great|cool|wow|yes i am|i am fine|fine sir"
).split("|"));
const normMsg = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9\u0900-\u097F]+/g, " ").trim();
function timesSent(messages, text) {
  const k = normMsg(text);
  if (!k || COMMON_REPLIES.has(k) || BUTTON_TEXTS.has(String(text || "").trim().toLowerCase())) return 1;
  return messages.filter((m) => m.role === "user" && normMsg(m.content) === k).length;
}

// ---------------------------------------------------------------------
// HINDI CHECK — code spots a mostly-Hindi message so Sam asks them to try
// it in English first (refinement 1), instead of handing over the sentence.
// Only clearly-Hindi words count (no "me", "to", "the", "or", "main").
// ---------------------------------------------------------------------
const HINDI_WORDS = new Set((
  "hai hain tha thi hu hoon hun ho mai mera meri mere mujhe muje mujhko mne maine mene mein hum hamne humne hamara hamari " +
  "tum tune tumne tumhara aap aapka ka ki ke ko se pr nahi nhi nahin aur bhi kya kyu kyun kyon kaise kese kab kaha kahan jab jb tab " +
  "toh yeh ye woh wo vo usne usko unhe unko isme usme isko uska uski unka bahut boht bohot bhot accha acha achha aaj kal abhi phir fir " +
  "karta karti karte krta krti krte kiya kia kar kr raha rahe rahi rha gaya gya gayi gyi aya aaya aayi khaya khana padha padhai padhayi " +
  "dekha samjhaya khaye kiye diye gaye aaye piye dekhe padhe likhe khele baat ghar pani peeta peeti peete khata khati khate sota uthta padhta likhta dekhta khelta chalta jaata aata aati aate lagta laga lagi achi acchi bahot yaha yahan waha wahan kyunki lekin magar agar maza mja mazaa chahiye sakta sakti sakte wala wali wale liye lie saath sath kuch koi sab sabse matlab mtlb " +
  "batao bolo likho kaafi kafi thoda thodi zyada jyada din raat subah shaam papa mummy bhai behen dost khelna khela khele jaana jata jati"
).split(" "));
function mostlyHindi(text) {
  const t = String(text || "");
  const dev = (t.match(/[\u0900-\u097F]/g) || []).length;
  const letters = (t.match(/[A-Za-z\u0900-\u097F]/g) || []).length;
  if (letters && dev / letters > 0.5) return true;
  const words = t.toLowerCase().match(/[a-z]+/g) || [];
  if (words.length < 3) return false;
  return words.filter((w) => HINDI_WORDS.has(w)).length / words.length >= 0.35;
}

// ---------------------------------------------------------------------
// STATE: what the app tells Sam each turn
// ---------------------------------------------------------------------
function drillTargets(mode) {
  return mode === "practice" ? { max: 5, need: 3 } : { max: 3, need: 2 };
}

function stateBlock(x) {
  const L = ["\n\nSTATE (tracked by the app; trust these facts):"];
  L.push("- Level: stage " + x.stage + " of 3.");
  L.push("- Practice today: " + Math.floor(x.todaySeconds / 60) + " min.");
  if (x.oneWordStreak >= 2) {
    L.push("- Very short answers in a row: " + x.oneWordStreak + "." +
      (x.oneWordStreak >= 3 ? " Gently ask for a fuller answer, or offer a different activity (rule 7f)." : ""));
  }
  if (x.tryFirst) L.push("- TRY FIRST NOW: their last message was mostly in Hindi. Do NOT give the English sentence in this reply. " +
    "Respond warmly to what they said, then ask them to try saying it in English themselves, with at most one key English word as a hint.");
  if (x.repeatCount >= REPEAT_FLAG_AT) L.push("- They have sent this exact message " + x.repeatCount + " times this session. If it is a game to make you say something, do not play along; otherwise help in a NEW way, not the same answer again.");
  if (x.pastUsed) L.push("- You already referred to a past session this time (in your opening), so don't bring up the past again unless they do.");
  if (x.lastWasRepeat) L.push("- Your previous reply was a repeat-after-me task, so this reply must NOT be one.");
  if (x.recentPraise.length) L.push("- Praise words already used recently: " + x.recentPraise.join(", ") + ". Pick a different one.");
  if (x.lastConcept) {
    L.push("- Last point you corrected: " + x.lastConcept + "." +
      (x.pendingVerbFamily ? " It was a verb form: if their message now uses it correctly, do the verb-family step (rule 7e)." : ""));
  }
  if (x.drill) {
    if (x.drill.items === 0) {
      L.push("- DEEP PRACTICE: \"" + x.drill.concept + "\" has gone wrong " + x.drill.errors + " times this session. Start a short drill now (rule 5h): " +
        "explain the pattern simply in Hinglish, then give item 1. At most " + x.drill.max + " items; stop when they get " + x.drill.need + " right without help.");
    } else {
      L.push("- DEEP PRACTICE in progress on \"" + x.drill.concept + "\": item " + x.drill.items + " of at most " + x.drill.max +
        " was just answered; " + x.drill.correct + " right so far, target " + x.drill.need + ". " +
        "Give feedback on this answer. If it reaches the target or this was the last item, end the drill warmly and go back to the conversation where you paused; otherwise give the next item with new names or objects.");
    }
  }
  if (x.teacherFocus) L.push("- TEACHER FOCUS this week: " + x.teacherFocus + ".");
  if (x.celebrate) L.push("- They just passed " + CELEBRATE_MIN + " minutes of practice today: celebrate in continuing words (rule 9), then carry on.");
  if (x.wrapUp) L.push("- About " + x.minutesLeft + " minutes of practice left today: over your next 1-2 replies, start bringing the session to a warm close.");
  return L.join("\n");
}

const FINAL_TASK =
  "\n\nFINAL REPLY TODAY: the student has reached today's practice limit. In this reply: respond warmly to their message in one or two lines, " +
  "then give the Progress Card (format from your rules), then end with a warm goodbye: aaj ke liye itna hi, kal phir milte hain. " +
  "Ask NO new question.";

// ---------------------------------------------------------------------
// CONCEPTS: grammar points over days (rule 5b-ii)
// ---------------------------------------------------------------------
async function conceptRow(sid, concept) {
  return ((await db("concepts?student_id=eq." + sid + "&subject=eq." + SUBJECT + "&concept=eq." + enc(concept) +
    "&select=concept_id,error_count,status,correct_days,last_correct")) || [])[0] || null;
}
const upsertConcept = (row) => db("concepts?on_conflict=student_id,subject,concept", {
  method: "POST", prefer: "resolution=merge-duplicates", body: row,
});

async function recordError(sid, concept, today) {
  const row = await conceptRow(sid, concept);
  await upsertConcept({
    student_id: sid, subject: SUBJECT, concept,
    error_count: ((row && row.error_count) || 0) + 1,
    status: row && row.status === "mastered" ? "practising" : (row && row.status) || "shaky",
    last_practised: today,
    next_revisit: addDays(today, 1),
  });
}

// Correct use counts once per day; mastered after correct use on 3 different days.
async function recordCorrect(sid, concept, today) {
  const row = await conceptRow(sid, concept);
  if (!row) return;
  const newDay = row.last_correct !== today;
  const days = (row.correct_days || 0) + (newDay ? 1 : 0);
  const mastered = days >= 3;
  await upsertConcept({
    student_id: sid, subject: SUBJECT, concept,
    correct_days: days, last_correct: today, last_practised: today,
    status: mastered ? "mastered" : "practising",
    next_revisit: addDays(today, mastered ? 14 : 4),
  });
}

// ---------------------------------------------------------------------
// ACTION: session — open Sam (resume or start fresh)
// ---------------------------------------------------------------------
async function startSession(res, apiKey, who, body) {
  const sid = who.sid;
  const now = new Date();
  const today = istDate(now);
  const noMemory = { session_id: null, resumed: false, greeting: firstGreeting(who.name), history: [], today_prior_seconds: 0, session_seconds: 0, saved: false };
  if (!dbReady() || !isUuid(sid)) return res.status(200).json(noMemory);

  try {
    const [stuRows, recentRows, stRows] = await Promise.all([
      db("students?student_id=eq." + sid + "&select=is_test,active"),
      db("sessions?student_id=eq." + sid + "&subject=eq." + SUBJECT +
        "&order=start_time.desc&limit=6&select=session_id,date,start_time,last_message_at,messages_count,summary,greeting,active_seconds"),
      db("state?student_id=eq." + sid + "&subject=eq." + SUBJECT + "&select=state_id,streak_days,last_active,working_memory"),
    ]);
    const stu = (stuRows || [])[0];
    if (!stu || stu.active === false) return res.status(200).json({ relogin: true, text: "Yeh account abhi band hai. Apne teacher se baat karo." });
    const isTest = !!stu.is_test;
    const recent = recentRows || [];
    let st = (stRows || [])[0];
    if (!st) {
      st = ((await db("state", { method: "POST", prefer: "return=representation", body: { student_id: sid, subject: SUBJECT } })) || [])[0];
    }
    const wm = (st && st.working_memory) || {};
    const latest = recent[0];
    const todaySecs = (list) => list.filter((s) => s.date === today).reduce((a, s) => a + (s.active_seconds || 0), 0);
    const limitOn = !isTest && DAILY_LIMIT_MIN > 0;

    // RESUME: back within 30 minutes → same conversation, shown again.
    if (latest && !body.fresh) {
      const lastAt = Date.parse(latest.last_message_at || latest.start_time);
      if (now.getTime() - lastAt < RESUME_MINUTES * 60000) {
        const msgs = (await db("messages?session_id=eq." + latest.session_id + "&order=timestamp.asc&limit=80&select=sender,text")) || [];
        const history = msgs.map((m) => ({ role: m.sender === "sam" ? "assistant" : "user", content: m.text || "" }));
        return res.status(200).json({
          session_id: latest.session_id, resumed: true, greeting: latest.greeting || "", history,
          today_prior_seconds: todaySecs(recent.slice(1)), session_seconds: latest.active_seconds || 0, saved: true,
          limit_reached: limitOn && wm.closed_date === today,
        });
      }
    }

    // DAILY LIMIT already used up today → no new session, no AI call.
    const prior = todaySecs(recent);
    if (limitOn && (wm.closed_date === today || prior >= DAILY_LIMIT_MIN * 60)) {
      return res.status(200).json({
        session_id: null, resumed: false, greeting: limitMessage(who.name), history: [],
        today_prior_seconds: prior, session_seconds: 0, saved: false, limit_reached: true,
      });
    }

    // NEW SESSION
    // 1. Notes for up to 2 recent sessions that had real conversation but no note yet.
    const pending = recent.filter((s) => !s.summary && (s.messages_count || 0) > 0).slice(0, 2);
    for (const s of pending) {
      try {
        const note = await summarise(apiKey, s.session_id);
        if (note) {
          s.summary = note;
          await db("sessions?session_id=eq." + s.session_id, { method: "PATCH", body: { summary: note } });
        }
      } catch (e) {
        console.error("Summary failed (carrying on):", e.message);
      }
    }

    // 2. Streak — worked out by code, never by the AI.
    let streak = 1;
    if (st) {
      const gap = st.last_active ? daysBetween(st.last_active, today) : null;
      streak = gap === 0 ? st.streak_days || 1 : gap === 1 ? (st.streak_days || 0) + 1 : 1;
    }

    // 3. Grammar points due for revisit (rule 5b-ii).
    let revisits = [];
    try {
      revisits = (await db("concepts?student_id=eq." + sid + "&subject=eq." + SUBJECT + "&status=neq.mastered&next_revisit=lte." + today +
        "&order=next_revisit.asc&limit=2&select=concept,status,error_count")) || [];
    } catch (e) {
      console.error("Revisit lookup failed (carrying on):", e.message);
    }

    // 4. What Sam remembers.
    const notes = recent.filter((s) => s.summary).slice(0, NOTES_SESSIONS);
    const memory = buildMemory(notes, today, streak, recent.length > 0, revisits);

    // 5. The opening. First-ever session: the fixed first-day greeting.
    //    Returning student: code picks the TYPE, Sam writes it, the app checks it.
    let greeting = firstGreeting(who.name), gModel = "fixed-greeting", gUsage = null;
    const history = Array.isArray(wm.opening_history) ? wm.opening_history.slice(-6) : [];
    let recalled = Array.isArray(wm.recalled_items) ? wm.recalled_items.slice(-12) : [];
    let openingType = "first";
    if (recent.length > 0) {
      openingType = pickOpening(history, notes.length > 0);
      greeting = returningGreeting(who.name);
      gModel = "fixed-returning";
      for (let i = 0; i < 2; i++) {
        const g = await generate(
          apiKey,
          BASE_PROMPT + SESSION_RULES + memory + studentBlock(who.name) + greetingTask(openingType, recalled),
          [{ role: "user", parts: [{ text: "[The student has just opened Sam. Write your opening message now.]" }] }],
          { maxTokens: 2048, label: "greeting", json: true, schema: GREETING_SCHEMA }
        );
        const clean = g.ok ? cleanGreeting(g.text) : null;
        if (clean) {
          greeting = clean.text; gModel = g.model; gUsage = g.usage;
          if (openingType === "recall" && clean.item) recalled = [...recalled, clean.item].slice(-12);
          break;
        }
        if (g.ok) console.error("Greeting failed checks, retrying:", g.text.slice(0, 120));
      }
      if (gModel === "fixed-returning") openingType = "fresh";   // the safe fallback is a fresh start
      console.log("Opening type:", openingType);
    }

    // 6. Save the session and Sam's opening as its first message.
    const mode = MODE_HINTS[body.mode] ? body.mode : "chat";
    const created = await db("sessions", {
      method: "POST", prefer: "return=representation",
      body: {
        student_id: sid, subject: SUBJECT, mode, date: today, start_time: now.toISOString(),
        greeting, memory_context: memory, messages_count: 0, minutes: 0, active_seconds: 0,
      },
    });
    const sessionId = created[0].session_id;
    await Promise.all([
      db("messages", {
        method: "POST",
        body: {
          session_id: sessionId, student_id: sid, sender: "sam", text: greeting, input_type: null, mode,
          model_used: gModel, ...usageCols(gUsage), timestamp: now.toISOString(),
        },
      }),
      // Fresh working memory for this session; keeps today's flags.
      st && db("state?state_id=eq." + st.state_id, {
        method: "PATCH",
        body: {
          streak_days: streak, last_active: today, updated_at: now.toISOString(),
          one_word_streak: 0, drill_active: false, drill_concept: null, pending_verb_family: false, last_activity: mode,
          working_memory: {
            session_id: sessionId,
            today: { date: today, prior_seconds: prior },
            recent_praise: [], last_was_repeat: false, last_concept: null,
            session_errors: {}, drill: null, level_votes: [],
            celebrated_date: wm.celebrated_date || null, closed_date: wm.closed_date || null,
            opening_type: openingType,
            opening_history: openingType === "first" ? history : [...history, openingType].slice(-6),
            recalled_items: recalled,
          },
        },
      }),
    ]);
    return res.status(200).json({
      session_id: sessionId, resumed: false, greeting, history: [],
      today_prior_seconds: prior, session_seconds: 0, streak, saved: true, limit_reached: false,
    });
  } catch (e) {
    console.error("Session start failed - Sam will chat without memory:", e.message);
    return res.status(200).json(noMemory);
  }
}

// ---------------------------------------------------------------------
// A CHAT TURN
// ---------------------------------------------------------------------
async function chatTurn(res, apiKey, who, body) {
  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ error: "No messages" });
  const sid = who.sid;
  const sentAt = new Date();
  const today = istDate(sentAt);
  const mode = MODE_HINTS[body.mode] ? body.mode : "chat";
  const inputType = ["voice", "typed", "button"].includes(body.input_type) ? body.input_type : "typed";
  const studentText = String(messages[messages.length - 1].content || "").slice(0, 4000);

  // Load this session (must belong to THIS student) and the student's state.
  let sess = null, st = null;
  if (dbReady() && isUuid(body.session_id) && isUuid(sid)) {
    try {
      const [sRows, stRows] = await Promise.all([
        db("sessions?session_id=eq." + body.session_id + "&student_id=eq." + sid +
          "&select=session_id,greeting,memory_context,last_message_at,start_time,messages_count,active_seconds,students(is_test,active)"),
        db("state?student_id=eq." + sid + "&subject=eq." + SUBJECT +
          "&select=state_id,stage,one_word_streak,drill_active,drill_concept,last_praise,pending_verb_family,teacher_focus,teacher_focus_until,working_memory"),
      ]);
      sess = (sRows || [])[0] || null;
      st = (stRows || [])[0] || null;
    } catch (e) {
      console.error("Could not load session/state (replying without memory):", e.message);
    }
  }
  if (sess && sess.students && sess.students.active === false) {
    return res.status(200).json({ relogin: true, text: "Yeh account abhi band hai. Apne teacher se baat karo." });
  }
  const isTest = !!(sess && sess.students && sess.students.is_test);
  const wm = (st && st.working_memory && typeof st.working_memory === "object") ? { ...st.working_memory } : {};
  if (sess && wm.session_id !== sess.session_id) {
    // State belongs to an older session (e.g. another device): start this session's notes fresh.
    Object.assign(wm, { session_id: sess.session_id, recent_praise: [], last_was_repeat: false, last_concept: null, session_errors: {}, drill: null, level_votes: [] });
  }
  wm.session_errors = wm.session_errors || {};
  wm.recent_praise = wm.recent_praise || [];
  wm.level_votes = wm.level_votes || [];

  // Practice time: gaps over 3 min don't count.
  let sessionSeconds = null, todaySeconds = 0;
  if (sess) {
    const lastAt = Date.parse(sess.last_message_at || sess.start_time);
    const gap = Math.max(0, Math.round((sentAt.getTime() - lastAt) / 1000));
    sessionSeconds = (sess.active_seconds || 0) + Math.min(gap, MAX_GAP_SECONDS);
    const prior = wm.today && wm.today.date === today ? wm.today.prior_seconds || 0 : 0;
    if (!wm.today || wm.today.date !== today) wm.today = { date: today, prior_seconds: 0 };
    todaySeconds = prior + sessionSeconds;
  }

  // DAILY LIMIT (real students only).
  const limitOn = !!sess && !isTest && DAILY_LIMIT_MIN > 0;
  const limitSecs = DAILY_LIMIT_MIN * 60;
  const lockedAlready = limitOn && wm.closed_date === today;
  const finalTurn = limitOn && !lockedAlready && todaySeconds >= limitSecs;
  const wrapUp = limitOn && !finalTurn && !lockedAlready && todaySeconds >= limitSecs - WRAP_UP_MIN * 60;

  // Short-answer streak (code, not AI).
  const oneWordStreak = inputType === "button" ? (st && st.one_word_streak) || 0
    : wordCount(studentText) <= 2 ? ((st && st.one_word_streak) || 0) + 1 : 0;

  // Drill bookkeeping before Sam writes: this message is an answer to the current item.
  let drill = wm.drill ? { ...wm.drill } : null;
  if (drill && drill.started && inputType !== "button") drill.items += 1;
  if (drill && !drill.started) drill.started = true;   // first drill turn: Sam starts it now

  const celebrate = !!sess && todaySeconds >= CELEBRATE_MIN * 60 && wm.celebrated_date !== today && !finalTurn;
  // Mostly-Hindi message → ask them to try first. Not when Sam just asked for a meaning
  // (then a Hindi answer is exactly right).
  const prevSam = [...messages].reverse().find((m, i) => i > 0 && m.role === "assistant");
  const askedMeaning = prevSam && /matlab|meaning|guess|hindi mein/i.test(String(prevSam.content || ""));
  const tryFirst = inputType !== "button" && !askedMeaning && mostlyHindi(studentText);
  const repeatCount = inputType === "button" ? 1 : timesSent(messages, studentText);
  const focusActive = st && st.teacher_focus && (!st.teacher_focus_until || st.teacher_focus_until >= today);

  let reply, judged = { corrected_concept: "none", student_got_it: "not_applicable", level_signal: "same", safety_flag: "none", structured: false }, g = null;
  if (lockedAlready) {
    reply = limitMessage(who.name);
  } else {
    // Order matters for Gemini's cache: brain → constant rules → memory → name
    // → opening → this turn's STATE → mode hint (→ final task) LAST.
    const systemText =
      BASE_PROMPT + SESSION_RULES +
      ((sess && sess.memory_context) || "") +
      studentBlock(who.name) +
      "\n\nOPENING (already shown to them this session): " + ((sess && sess.greeting) || firstGreeting(who.name)) +
      stateBlock({
        stage: (st && st.stage) || 1,
        todaySeconds,
        oneWordStreak,
        lastWasRepeat: !!wm.last_was_repeat,
        tryFirst,
        repeatCount,
        pastUsed: ["followup", "recall"].includes(wm.opening_type),
        recentPraise: wm.recent_praise,
        lastConcept: wm.last_concept,
        pendingVerbFamily: !!(st && st.pending_verb_family),
        drill: drill && { ...drill, errors: wm.session_errors[drill.concept] || 2, items: drill.items },
        teacherFocus: focusActive ? TEACHER_FOCUS_TEXT[st.teacher_focus] || st.teacher_focus : null,
        celebrate,
        wrapUp,
        minutesLeft: Math.max(1, Math.ceil((limitSecs - todaySeconds) / 60)),
      }) +
      "\n\n" + MODE_HINTS[mode] +
      (finalTurn ? FINAL_TASK : "");

    let recentMsgs = messages.slice(-HISTORY_TO_GEMINI);
    while (recentMsgs.length && recentMsgs[0].role === "assistant") recentMsgs = recentMsgs.slice(1);
    const contents = recentMsgs.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "").slice(0, 4000) }],
    }));
    if (!contents.length) return res.status(400).json({ error: "No student message" });

    g = await generate(apiKey, systemText, contents, { label: "reply", json: true });
    if (g.ok) {
      judged = parseReply(g.text);
      reply = judged.reply;
    } else {
      reply = friendlyError(g.status);
      if (g.status === "blocked") judged.safety_flag = "blocked";   // Google refused the student's message
    }
  }
  // Safety flags for the owner/teachers (query 08). Distress pauses any drill.
  // Sam's judgement wins; otherwise the 3rd identical message is flagged "repeated".
  const safetyFlag = inputType === "button" ? null
    : judged.safety_flag !== "none" ? judged.safety_flag
    : repeatCount === REPEAT_FLAG_AT ? "repeated" : null;
  if (safetyFlag) console.log("SAFETY FLAG:", safetyFlag);

  // ---- Update the state from what happened (code, not AI) ----
  let stage = (st && st.stage) || 1, promotion = null;
  const conceptWrites = [];
  if (sess && st && !lockedAlready && g && g.ok) {
    const cc = judged.corrected_concept, got = judged.student_got_it;
    if (got === "yes" && TRACKED(wm.last_concept)) conceptWrites.push(["correct", wm.last_concept]);
    if (TRACKED(cc)) {
      wm.session_errors[cc] = (wm.session_errors[cc] || 0) + 1;
      conceptWrites.push(["error", cc]);
    }
    let pendingVerb = !!st.pending_verb_family;
    if (cc !== "none") {
      wm.last_concept = cc;
      pendingVerb = VERB_CONCEPTS.includes(cc);
    } else if (got === "yes") {
      wm.last_concept = null;
      pendingVerb = false;
    }
    st.pending_verb_family = pendingVerb;

    // Drills (rule 5h): start after the same point goes wrong twice; finish on target or item cap.
    if (drill && drill.started && drill.items > 0) {
      if (got === "yes") drill.correct += 1;
      if (drill.correct >= drill.need || drill.items >= drill.max) {
        wm.session_errors[drill.concept] = 0;
        drill = null;
      }
    } else if (!drill && TRACKED(cc) && wm.session_errors[cc] >= 2) {
      drill = { concept: cc, items: 0, correct: 0, started: false, ...drillTargets(mode) };
    }

    // Level (rule 8): 3 "harder" in a row → up a stage; 2 "easier" in a row → down. Not during drills.
    if (!drill) {
      wm.level_votes = [...wm.level_votes, judged.level_signal].slice(-4);
      const v = wm.level_votes;
      if (stage < 3 && v.length >= 3 && v.slice(-3).every((x) => x === "harder")) {
        promotion = { from_stage: stage, to_stage: stage + 1 }; stage += 1; wm.level_votes = [];
      } else if (stage > 1 && v.length >= 2 && v.slice(-2).every((x) => x === "easier")) {
        promotion = { from_stage: stage, to_stage: stage - 1 }; stage -= 1; wm.level_votes = [];
      }
    }

    if (safetyFlag === "distress") drill = null;
    const praised = praiseUsed(reply);
    if (praised.length) wm.recent_praise = [...wm.recent_praise, ...praised].slice(-4);
    wm.last_was_repeat = REPEAT_RX.test(reply);
  }
  if (sess && st) {
    // Only move the drill / celebration forward if Sam actually replied.
    if (g && g.ok) {
      wm.drill = drill;
      if (celebrate) wm.celebrated_date = today;
    }
    if (finalTurn) wm.closed_date = today;
  }

  // ---- Save ----
  if (sess) {
    const row = (sender, text, extra) => ({
      session_id: sess.session_id, student_id: sid, sender, text, mode,
      input_type: null, model_used: null, meta: null,
      input_tokens: null, cached_tokens: null, output_tokens: null, thinking_tokens: null,
      ...extra,
    });
    const meta = {
      corrected_concept: judged.corrected_concept, student_got_it: judged.student_got_it, level_signal: judged.level_signal,
      structured: judged.structured, thinking: g && g.thinking, stage, one_word_streak: oneWordStreak, try_first: tryFirst,
      safety_flag: safetyFlag, drill: drill ? drill.concept : null, flags: [celebrate && "celebrate", wrapUp && "wrap_up", finalTurn && "final", lockedAlready && "locked"].filter(Boolean),
    };
    const writes = [
      db("messages", {
        method: "POST",
        body: [
          row("student", studentText, { input_type: inputType, meta: safetyFlag ? { safety_flag: safetyFlag, times_sent: repeatCount } : null, timestamp: sentAt.toISOString() }),
          row("sam", reply, {
            model_used: lockedAlready ? "daily-limit" : g && g.ok ? g.model : "error:" + (g && g.status),
            meta, ...usageCols(g && g.usage),
            timestamp: new Date(Math.max(Date.now(), sentAt.getTime() + 1)).toISOString(),
          }),
        ],
      }),
      db("sessions?session_id=eq." + sess.session_id, {
        method: "PATCH",
        body: {
          messages_count: (sess.messages_count || 0) + (inputType === "button" ? 0 : 1),
          last_message_at: sentAt.toISOString(),
          active_seconds: sessionSeconds,
          minutes: Math.round(sessionSeconds / 60),
        },
      }),
    ];
    if (st) {
      writes.push(db("state?state_id=eq." + st.state_id, {
        method: "PATCH",
        body: {
          stage, one_word_streak: oneWordStreak,
          drill_active: !!wm.drill, drill_concept: wm.drill ? wm.drill.concept : null,
          last_praise: wm.recent_praise.length ? wm.recent_praise[wm.recent_praise.length - 1] : st.last_praise || null,
          pending_verb_family: !!st.pending_verb_family, last_activity: mode,
          working_memory: wm, updated_at: new Date().toISOString(),
        },
      }));
      for (const [kind, c] of conceptWrites) writes.push(kind === "error" ? recordError(sid, c, today) : recordCorrect(sid, c, today));
      if (promotion) writes.push(db("promotions_log", { method: "POST", body: { student_id: sid, subject: SUBJECT, ...promotion, date: today } }));
    }
    const results = await Promise.allSettled(writes);
    results.forEach((r) => { if (r.status === "rejected") console.error("Saving failed (reply still shown):", r.reason && r.reason.message); });
    console.log("State", JSON.stringify({ stage, oneWordStreak, drill: drill && drill.concept, last: wm.last_concept, today_min: Math.floor(todaySeconds / 60), flags: meta.flags }));
  }

  return res.status(200).json({
    text: reply,
    session_seconds: sessionSeconds,
    saved: !!sess,
    limit_reached: finalTurn || lockedAlready,
  });
}

// ---------------------------------------------------------------------
// ENTRY POINT
// ---------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Server not configured" });

    // Only logged-in students may use Sam.
    const who = verifyToken(body.token, process.env.SESSION_SECRET);
    if (!who) return res.status(200).json({ relogin: true, text: "Tumhara login purana ho gaya hai. Phir se login karo. 😊" });

    if (body.action === "session") return await startSession(res, apiKey, who, body);
    return await chatTurn(res, apiKey, who, body);
  } catch (e) {
    console.error(e);
    return res.status(200).json({ text: "Sorry, kuch problem ho gayi. Please try again!" });
  }
}
