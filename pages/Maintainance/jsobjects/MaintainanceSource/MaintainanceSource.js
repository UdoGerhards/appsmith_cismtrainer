export default {
  setup: async() => {
		
		console.log("Setup running ... ");
		
    await removeValue('trackMap');
    await this.loadBookOfQuestions();
    //await this.loadExplanationFromDB();
		console.log("Setup finished ... ");
  },
  getFormattedQuestions: () => {
    // 1. Hole das Array aus der Query (fallback auf ein leeres Array)
    const rawData = GetQuestions.data || [];

    // 2. Mache jedes Element flach und typsicher für die Inputs
    return rawData.map(item => {
      // Hilfsfunktion zum Finden der Antwort nach Typ (A, B, C, D)
      const findAnswer = (type) => {
        const found = (item.answers || []).find(a => a.type === type);
        return found?.text ? String(found.text).trim() : "";
      };

      return {
        _id: String(item._id || ""),
        question: String(item.question || "").trim(),
        domain: String(item.domain || "").trim(),
        correct: String(item.correct || "").trim(),
				performed: item.usageCount,
        answerA: findAnswer("A"),
        answerB: findAnswer("B"),
        answerC: findAnswer("C"),
        answerD: findAnswer("D")
      };
    });
  },

  trackChanges: async (id, fieldName, value) => {
    if (!id) {
      console.error("Keine ID übergeben! ID ist:", id);
      return;
    }

    let trackMap = appsmith.store.trackMap || {};

    // Initialisiere das Objekt für diese ID, falls noch nicht da
    if (!trackMap[id]) {
      trackMap[id] = { _id: id };
    }

    // Setze den geänderten Wert direkt in das Map-Objekt
    trackMap[id][fieldName] = value;

    await storeValue('trackMap', trackMap, false);
  },

  getChangedListItems: () => {
    const trackMap = appsmith.store.trackMap || {};
    return Object.values(trackMap);
  },

  // 3. Änderungen speichern (inklusive Fragen, Domain, Correct und Antworten A-D)
  saveChanges: async() => {
    const itemsToSave = this.getChangedListItems();

    console.log("Items To Save:", itemsToSave);

    const questionBatch = [];
    const answersBatch = [];

    for (const item of itemsToSave) {
      console.log("Speichere Live-Daten für ID:", item._id);

      // A) Hole den aktuellen Stand aus der Datenbank
      const questionResult = await FindQuestion.run({ id: item._id });
      const questionDocument = Array.isArray(questionResult) ? questionResult[0] : questionResult;
      //console.log("Question: ", questionDocument);

      const answerResult = await FindAnswers.run({ id: item._id });
      const answerDocuments = answerResult;
      console.log("Answers: ", answerDocuments);

      if (questionDocument) {
        const mergedQuestion = { ...questionDocument }; // Kopie des Originals
        for (const key of Object.keys(questionDocument)) {
          // Prüfen, ob das item diesen Schlüssel überhaupt besitzt (und er nicht undefined ist)
          if (item[key] !== undefined) {
            mergedQuestion[key] = item[key];
          }
        }
        questionBatch.push(mergedQuestion);

        if (answerDocuments) {
          answerDocuments.map( a => {
            if (a.type.trim() === "A") {
              a.text = item["answerA"]
            } else if (a.type.trim() === "B") {
              a.text = item["answerB"]
            } else if (a.type.trim() === "C") {
              a.text = item["answerC"]
            } else if (a.type.trim() === "D") {
              a.text = item["answerD"]
            }
          });

          answersBatch.push(...answerDocuments);
        }
      }
    }

    console.log("Questions neu: ", questionBatch);
    //this.updateQuestions(questionBatch);

    console.log("Answers: neu", answersBatch);
    //this.updateAnswers(answersBatch);

    await removeValue('track');
  },
  // Im JS-Object
  updateQuestions: async (questions) => {

    // Mappe die Daten in das MongoDB-Format
    const operations = questions.map(item => ({
      updateOne: {
        "filter": { "_id": item._id },
        "update": {
          "$set": {
            "question": item.question,
            "correct": item.correct,
            "domain": item.domain,
            "ID": item.ID
          }
        },
        "upsert": true
      }
    }));

    // Hier wird die MongoDB Raw-Query direkt aus dem JS-Object aufgerufen
    return BulkUpdateQuestions.run({ ops: operations });
  },

  updateAnswers: async (answers) => {
    // Mapping der Answers für die Bulk-Operation
    const operations = answers.map(item => ({
      updateOne: {
        // Filtere nach der _id. 
        // Falls _id ein String ist, nutze: ObjectId(item._id)
        "filter": { "_id": { "$oid": item._id } },
        "update": {
          "$set": {
            "ID": item.ID,
            "type": item.type,
            "text": item.text || "", // Falls undefined, setze auf leeren String
            // Konvertiere die IDs und das Datum explizit für MongoDB
            "question_id": { "$oid": item.question_id },
            "createdAt": { "$date": item.createdAt }
          }
        },
        "upsert": true
      }
    }));

    // Ausführung der Raw-Query
    return await BulkUpdateAnswers.run({ ops: operations });
  },
	
  handleSortChange: async () => {
		await storeValue('newSorting', true);
		
    const selectedValue = sort.selectedOptionValue;
		console.log("Eingestellte Sortierung: ", selectedValue);
		
		await storeValue('sortByWrong', selectedValue, false);		
		await storeValue('sortByBookmark', Number(bookmarkSort.isSwitchedOn) * -1);

		await this.loadBookOfQuestions();
  },

  loadBookOfQuestions: async() =>{
    const allQuestions = await GetQuestions.run();
		
    await storeValue("book_questions", allQuestions, false);
    await storeValue('book_index', 0 , false);

    console.log("Book of questions: ", allQuestions);
    await this.loadExplanationFromDB();
  },

  dekrementBookIndex: async () => {
    let currIndex = appsmith.store.book_index;

    // Wichtig: Wir prüfen, ob der Index ungleich undefined/null ist
    if (currIndex !== undefined && currIndex !== null && currIndex > 0) {
			removeValue("evaluate");
			check_answerA.setValue(false);
			check_answerB.setValue(false);
			check_answerC.setValue(false);
			check_answerD.setValue(false);

			currIndex--;
			
      // Der dritte Parameter 'false' sorgt dafür, dass die Seite NICHT neu lädt (gut so!)
      await storeValue('book_index', currIndex, false);
			
      await this.loadExplanationFromDB();
    }
  },
  inkrementBookIndex: async () => {
    // Falls der Store komplett leer ist, starten wir bei 0
    let currIndex = appsmith.store.book_index ?? 0;
    const allQuestions = appsmith.store.book_questions || [];
    const questionCount = allQuestions.length;

    // Der maximale Index ist immer 'Anzahl der Fragen minus 1' (da wir bei 0 anfangen zu zählen)
    if (currIndex < questionCount - 1) {
			removeValue("evaluate");
			check_answerA.setValue(false);
			check_answerB.setValue(false);
			check_answerC.setValue(false);
			check_answerD.setValue(false);
			
      currIndex++;

      await storeValue('book_index', currIndex, false);
      await this.loadExplanationFromDB();
    }
  },
  disableButtonDown:()  =>  {
    const currIndex = appsmith.store.book_index;
    return (!currIndex || currIndex <= 0);
  },
  disableButtonUp: ()  =>  {
    const currIndex = appsmith.store.book_index;
    const allQuestions = appsmith.store.book_questions;
    const questionCount = allQuestions.length;

    return (currIndex == undefined || !questionCount || currIndex > questionCount)
  },

  isCorectAnswer: (answerIdx) => {
    const currIndex = appsmith.store.book_index;
    const allQuestions = appsmith.store.book_questions; // Greift direkt auf das Array zu

    const currentQuestion = allQuestions[currIndex];
    const targetAnswer = currentQuestion.answers[answerIdx];
    const answersType = targetAnswer.type.trim();
    const questionCorrect = currentQuestion.correct.trim();
		
    if (interactive.isSwitchedOn && appsmith.store.evaluate === true) {	
			
      console.log("Evaluation:", appsmith.store.evaluate);
			
      if (answerIdx === 0 && check_answerA.isChecked) {
          return (questionCorrect === "A") ? "#15803d" : "#EF4444";
      } else if (answerIdx === 1 && check_answerB.isChecked) {
          return (questionCorrect === "B") ? "#15803d" : "#EF4444";
      } else if (answerIdx === 2 && check_answerC.isChecked) {
          return (questionCorrect === "C") ? "#15803d" : "#EF4444";
      } else if (answerIdx === 3 && check_answerD.isChecked) {
          return (questionCorrect === "D") ? "#15803d" : "#EF4444";
      }
      
      // Fallback, falls der Modus aktiv ist, aber die Checkbox nicht zu diesem Index gehört
      return "#231F20";

    } else if (interactive.isSwitchedOn) {
      console.log("Evaluation:", appsmith.store.evaluate);
      return "#231F20";
    } else {
      // Standard-Farbe (Nicht-Interaktiver Modus): Grün bei Übereinstimmung, sonst Dunkelgrau
      return (answersType === questionCorrect) ? "#15803d" : "#231F20";
    }
  },
	
  interactiveAnswerClick: (currentItem) => {
    console.log(currentItem);
    const val = false;

    if (currentItem.widgetName === "check_answerA") {
      check_answerB.setValue(val);
      check_answerC.setValue(val);
      check_answerD.setValue(val);
    } else if (currentItem.widgetName === "check_answerB") {
      check_answerA.setValue(val);
      check_answerC.setValue(val);
      check_answerD.setValue(val);
    } else if (currentItem.widgetName === "check_answerC") {
      check_answerA.setValue(val);
      check_answerB.setValue(val);
      check_answerD.setValue(val);
    } else if (currentItem.widgetName === "check_answerD") {
      check_answerA.setValue(val);
      check_answerB.setValue(val);
      check_answerC.setValue(val);
    }
  },

  loadExplanationFromDB: async() => {

		console.log("Loading explanation fŕom DB ...");
    const currIndex = appsmith.store.book_index;
    const allQuestions = appsmith.store.book_questions;

    const qId = allQuestions[currIndex]._id;

    console.log(qId);

    const explanationResult = await FindAICache.run({ id: qId });

    console.log("Explanation ", explanationResult);

    // Prüfen, ob das Array existiert und mindestens ein Dokument enthält
    if (explanationResult && explanationResult.length > 0) {
      // Greift auf das erste gefundene Dokument zu und gibt das Feld 'explanation' zurück
      await storeValue('book_ai_explanation', explanationResult[0].explanation, false);
    } else {
      removeValue('book_ai_explanation');
    }
		console.log("Loading explanation done ...");
  },

  getExplanation: async () => {
    const currIndex = appsmith.store.book_index;
    const allQuestions = appsmith.store.book_questions;

    // 1. Sicherheitsprüfung: Existiert das Fragen-Array und die aktuelle Frage?
    if (!allQuestions || !allQuestions[currIndex]) {
      console.error("Fehler: Keine Frage am aktuellen Index gefunden.");
      return;
    }

    const currQuestion = allQuestions[currIndex];
    console.log("Aktuelle Frage:", currQuestion);

    // 2. Sicherheitsprüfung für den Such-Typ (Nutzt 'correct' der Frage)
    // Wenn 'correct' fehlt, nutzen wir einen leeren String "" als Fallback
    const searchType = (currQuestion.correct || "").trim().toUpperCase();

    if (!searchType) {
      console.warn("Warnung: Die aktuelle Frage hat keinen 'correct'-Typ hinterlegt.");
      return;
    }

    const answers = currQuestion.answers;

    // 3. Sicherheitsprüfung: Existiert das Antworten-Array?
    if (!answers || !Array.isArray(answers)) {
      console.error("Fehler: Das Antworten-Array fehlt oder ist ungültig.");
      return;
    }

    // 4. Absichern der .find()-Methode gegen undefined bei 'antwort.type'
    const correctAnswer = answers.find(antwort => {
      const antwortType = (antwort.type || "").trim().toUpperCase();
      return antwortType === searchType;
    });

    const wrongAnswers = answers.filter(antwort => {
      const antwortType = (antwort.type || "").trim().toUpperCase();
      // Gibt true zurück für alle Antworten, die NICHT dem searchType entsprechen
      return antwortType !== searchType;
    });

    // 5. Sicherheitsprüfung: Wurde überhaupt eine passende Antwort gefunden?
    const correctAnswerText = correctAnswer ? correctAnswer.text : "Kein Antworttext verfügbar";
    const questionText = currQuestion.question || "Kein Fragentext verfügbar";

    // ID absichern (Appsmith wandelt Mongo-IDs oft in Strings um, falls nicht vorhanden nutzen wir "")
    const questionId = currQuestion._id || "";

    // 6. Aufruf der Erklärung mit allen abgesicherten Werten
    await this.explainQuestion(questionId, questionText, correctAnswerText,wrongAnswers);
  },
	
	saveExplanation: async () => {
		const currIndex = appsmith.store.book_index;
    const allQuestions = appsmith.store.book_questions;
		const currQuestion = allQuestions[currIndex];
		
		showAlert("Saving explanation!!!");
		
    // 1. Hole das bearbeitete HTML direkt aus dem Modell deines Custom Widgets
    // Ersetze 'CustomWidget1' mit dem echten Namen deines Widgets
    const updatedHtml = q_explanation.model.aiErklaerung;
		
		console.log(updatedHtml);

    // Sicherheits-Check: Falls der Text leer ist, brechen wir ab
    if (!updatedHtml || updatedHtml.trim() === "") {
      showAlert("Speichern abgebrochen: Der Inhalt darf nicht leer sein.", "warning");
      return;
    }
		
		console.log(currQuestion._id);
		console.log(typeof currQuestion._id);

    try {
      // Führt die MongoDB-Query aus und übergibt die Werte direkt als Aufrufparameter
      await UpdateCISMExplanation.run({
        idParam: currQuestion._id,
        htmlParam: updatedHtml
      });

      // Erfolgsmeldung anzeigen
      showAlert("Erklärung erfolgreich in MongoDB gespeichert!", "success");

      // Optional: Hier kannst du deine Cache-Lade-Query neu triggern, damit das UI updated
      // await FindAICache.run({ id: frageId });

    } catch (error) {
      console.error("Fehler beim Speichern der Query:", error);
      showAlert("Datenbank-Update fehlgeschlagen.", "error");
    }
  },

	
  explainQuestion: async (id, questionText, correctAnswer, wrongAnswers) => {
		showAlert("Lade Erklärung");
    console.log("Explanation process running for ID:", id);
    // 1. Zuerst im Cache suchen
    // console.log("Mongo lookup ...");

    const cachedEntry = await FindAICache.run({ id: id });

    if (!cachedEntry || cachedEntry.length === 0) {

      // console.log("Gemini lookup ...");

      // Umwandlung des falschen Antworten-Arrays in einen strukturierten Text für den Prompt
      const wrongAnswersFormatted = (wrongAnswers || [])
        .map(a => `Type ${a.type || 'Unknown'}: "${a.text || 'No text'}"`)
        .join('\n');


      const prompt = `
								You are a senior CISM Examiner and an expert Information Security Chief Officer (CISO).
								Analyze the following question details with maximum professional depth, focusing heavily on ISACA's core management philosophy (Business Alignment, Risk-Differentiated Decisions, and Governance over Operations).

								Question: ${questionText}
								Correct Answer: ${correctAnswer}

								Incorrect Answers to analyze:
								${wrongAnswersFormatted}

								Provide a deep, precise, and highly educational explanation in English. You must cover five aspects:
								1. Detailed analysis of the question (Core intent, hidden traps, and key terms like 'BEST', 'MOST' or 'FIRST').
								2. Professional explanation why the Correct Answer is strategically correct based on CISM standards.
								3. Professional analysis explaining why EACH incorrect answer is factually, operationally, or strategically wrong from a managerial perspective.
								4. A Deep Dive section explaining the underlying core concept (e.g., Risk Appetite vs. Tolerance, Governance vs. Management, Metrics vs. Indicators).
								5. A list of 1-3 official CISM domains, review manual chapters, or official ISACA source links relevant to this specific question.

								HTML OUTPUT TEMPLATE (You must strictly follow this structure and use these exact IDs):
								<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding:10px;">
										<article style="padding:10px;" id="block-question">
												<h2><b>Question:</b> ${questionText}</h2>
												<span id="text-question">[Insert your detailed strategic analysis of the question here]</span>
										</article>
										<article style="padding:10px;" id="block-answer">
												<p><b>Correct Answer </b>(${correctAnswer}):</p>
												<span id="text-correct">[Insert your explanation why this answer is correct based on CISM standards here]</span>
										</article>
										<article style="padding:10px;" id="block-incorrect">
												<p><b>Incorrect Answers Analysis:</b></p>
												<span id="text-incorrect">[Analyze each incorrect answer here. Contrast operational fixes with strategic/managerial solutions]</span>
										</article>
										<article style="padding:10px;" id="block-deep-dive">
												<p><b>CISM Executive Deep Dive:</b></p>
												<span id="text-deep-dive">[Provide a masterclass-level explanation of the underlying security governance or risk concept here, explaining the 'CISO Mindset' needed for this scenario]</span>
										</article>
										<article style="padding:10px;" id="block-sources">
												<p><b>Sources:</b></p>
												<span id="text-source">
														<ul style="margin-top: 5px; padding-left: 20px;">
																<!-- Dynamically generate 1-3 real list items here based on the question topic. -->
														</ul>
												</span>
										</article>
								</div>

								CRITICAL RULES:
								1. Write the entire response in English.
								2. Do NOT include any introductory, conversational, or filler phrases. Start immediately with the HTML structure.
								3. Inside <span id="text-source">, you MUST dynamically generate 1 to 3 real <li> items containing clickable HTML <a> links to official ISACA domains.
								4. Do NOT use any Markdown formatting like asterisks (**) or hashtags (#).
								5. Ensure every <a> link has target="_blank" and style="color: #2563eb; text-decoration: underline;"
								`;


      await storeValue('geminiPrompt', prompt);

      try {
        const response = await Gemini_Explain_API.run();
        const parts = response.candidates[0].content.parts;

        let fullExplanation = "";
        if (Array.isArray(parts)) {
          fullExplanation = parts.map(p => p.text).join('');
        }
				
				console.log("Gemini has finished!");
				showAlert("Gemini ist fertig!!!");

        // console.log("Full Explanation", fullExplanation);

        // RegEx-Suche inklusive der neuen ID "text-incorrect"
        const questionMatch = fullExplanation.match(/<span[^>]*id="text-question"[^>]*>([\s\S]*?)<\/span>/i);
        const correctMatch = fullExplanation.match(/<span[^>]*id="text-correct"[^>]*>([\s\S]*?)<\/span>/i);
        const incorrectMatch = fullExplanation.match(/<span[^>]*id="text-incorrect"[^>]*>([\s\S]*?)<\/span>/i);
        const deepDiveMatch = fullExplanation.match(/<span[^>]*id="text-deep-dive"[^>]*>([\s\S]*?)<\/span>/i);
        const sourcesMatch = fullExplanation.match(/<span[^>]*id="text-source"[^>]*>([\s\S]*?)<\/span>/i);

        const extractedQuestion = questionMatch ? questionMatch[1].trim() : "";
        const extractedCorrect = correctMatch ? correctMatch[1].trim() : "";
        const extractedIncorrect = incorrectMatch ? incorrectMatch[1].trim() : "";
        const extractedDeepDive = deepDiveMatch ? deepDiveMatch[1].trim() : "";
        const extractedSources = sourcesMatch ? sourcesMatch[1].trim() : "";

        // --- NEU: RAG-Prüfung über AnythingLLM starten ---
        const anythingLlmPrompt = `Verify the core facts of this CISM question and answer against the uploaded official ISACA Review Manual. Correct or supplement specific book-facts, rules, or standards if necessary.

						Question: ${questionText}
						Answer to verify: ${extractedCorrect}`;

        // Prompt im Appsmith Store ablegen (wird von AnythingLLM_Chat_API ausgelesen)
        await storeValue('anythingLlmPrompt', anythingLlmPrompt);

				console.log("Now running anythingllm ... ");
				showAlert("Validier mit anythingllm");
        // AnythingLLM API ausführen
        const anythingLlmResponse = await AnythingLLM_Chat_API.run();
        const verifiedFacts = anythingLlmResponse.textResponse || "Verified against local ISACA Reference Manual.";

        // 3. Finale Strukturierung mit Gemini-Inhalten UND dem AnythingLLM-Verifizierungsblock
        const customFormattedExplanation = `
								<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding:10px;">
									<article style="padding:10px;" id="block-question">
										<h2><b>Question:</b> ${questionText}</h2>
										<span style="font-size:14px;">${extractedQuestion}</span>
									</article>
									<article style="padding:10px;" id="block-answer">
										<h3>Correct Answer (${correctAnswer}):</h3>
										<p style="font-size:14px;">${extractedCorrect}</p>
									</article>
									<article style="padding:10px;" id="block-incorrect">
										<h3>Incorrect Answers:</h3>
										<p style="font-size:14px;">${extractedIncorrect}</p>
									</article>
									<article style="padding:10px;" id="block-deep-dive">
										<h3>CISM Executive Deep Dive:</h3>
										<p style="font-size:14px;">${extractedDeepDive}</p>
									</article>
								</div>
							`.trim();

        // 4. Speicher-Objekt für MongoDB
        const docToInsert = {
          questionID: { "$oid": id },
          explanation: customFormattedExplanation
        };

				console.log("Now saving to MongoDB ... ");
        await InsertAICache.run({ doc: docToInsert });
        //console.log("Store restricted result in Mongo ...", docToInsert);

        // Im Store speichern, damit das Custom Widget es sofort anzeigt
        await storeValue('book_ai_explanation', customFormattedExplanation);
        //console.log("Neue Erklärung gespeichert.");
				showAlert("Neue Erklärung gespeichert");
      } catch (error) {
        //console.error("Fehler bei Gemini:", error);
        removeValue('book_ai_explanation');
      }
    } else {
      // Falls im Cache gefunden: Direkt in den Store laden
      console.log("Erklärung im Cache gefunden.");
      await storeValue('book_ai_explanation', cachedEntry[0].explanation);
    }
  },

  deleteCurrentExplanation: async () => {
    // Hier ist 'const' erlaubt!
    const currentQuestion = appsmith.store.book_questions?.[appsmith.store.book_index];

    if (!currentQuestion || !currentQuestion._id) {
      showAlert('Fehler: Keine gültige Frage gefunden.', 'error');
      return;
    }

    const qId = String(currentQuestion._id);

    try {
      await DeleteAICache.run({ id: qId });
      showAlert('Erklärung erfolgreich gelöscht!', 'success');
      // Aktualisiert das Custom Widget sofort reaktiv
      await storeValue('book_ai_explanation', '');
    } catch (error) {
      showAlert('Fehler beim Löschen: ' + error.message, 'error');
    }
  },
}