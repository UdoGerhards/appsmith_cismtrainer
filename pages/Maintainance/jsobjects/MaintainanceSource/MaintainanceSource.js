export default {
  setup: async() => {
		
		this.loadAndSaveConfiguration();
		
		console.log("Setup running ... ");
		
    await removeValue('trackMap');
    await this.loadBookOfQuestions();
    //await this.loadExplanationFromDB();
		console.log("Setup finished ... ");
  },
	
	loadAndSaveConfiguration: async () => {
    try {
      // 1. MongoDB-Query ausführen (ersetze 'findConfiguration' mit dem tatsächlichen Namen deiner Query)
      const data = await loadConfiguration.run();
      
      // Prüfen, ob Daten vorhanden sind
      if (!data || !Array.isArray(data)) {
        showAlert("Keine Konfigurationsdaten gefunden.", "warning");
        return;
      }

      // 2. Durch das Array iterieren und jeden Wert in den Store schreiben
      // Dabei nutzen wir den Wert aus 'name' als Store-Key und 'value' als Inhalt
      for (const item of data) {
        if (item.name) {
					showAlert("Configuration - saving '"+item.name+"'", "success");
          await storeValue(item.name, item.value);
        }
      }

      showAlert("Konfiguration erfolgreich in den Store geladen!", "success");
      
    } catch (error) {
      showAlert("Fehler beim Laden der Konfiguration: " + error.message, "error");
    }
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

    const explanationResult = await FindExplanation.run({ qId: String(qId) });

    console.log("Explanation ", explanationResult);

    // Prüfen, ob das Array existiert und mindestens ein Dokument enthält
    if (explanationResult && explanationResult.length > 0) {
      // Greift auf das erste gefundene Dokument zu und gibt das Feld 'explanation' zurück
      await storeValue('questionGeminiExplanation', explanationResult[0].text, false);
    } else {
      removeValue('questionGeminiExplanation');
    }
		console.log("Loading explanation done ...");
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
	
	processGeminiExplain: async() => {

		showAlert("Evaluierung mit Gemini!!");

		const index =  appsmith.store.book_index;
		const questions = appsmith.store.book_questions;
		const question = questions[index];

		console.log("Question to explain: ", question);

		if (!question) return;

		console.log(question);

		const existingResult = await FindExplanation.run({
			qId: String(question._id)
		});
		
		console.log("Evaluation db ", existingResult);

		let evaluationText = null;
		// 2. Auswerten
		if (existingResult && existingResult.length > 0) {

			showAlert("Bereits gespeicherte Evaluierung in Datenbank gefunden ... ");

			// Es gibt bereits einen Eintrag -> Text direkt aus der DB nehmen
			evaluationText = existingResult[0].text;

			console.log("Bereits gespeicherte Erklärung geladen.");
		} else {

			showAlert("Evaluaiere mit Gemini ...");

			// 1. Extrahiere und sortiere die Antworten alphabetisch nach 'type' (A, B, C, D)
			const sortedAnswers = [...question.answers].sort((a, b) => a.type.localeCompare(b.type));

			// 2. Erstelle ein dynamisches Options-Objekt aus dem sortierten Array
			const optionsObj = {};
			sortedAnswers.forEach(ans => {
				optionsObj[ans.type] = ans.text.trim();
			});

			// 3. Baue das questionData-Objekt mit den dynamischen Daten zusammen
			const questionData = {
				domain: question.domain,
				question: question.question,
				options: optionsObj,
				correct: question.correct.trim(),
				user: question.userAnswer // Falls vorhanden, ansonsten entsprechendes Feld nutzen
			};

			console.log(questionData);

			// 4. Übergabe an die API/KI als mehrzeiliger String (JavaScript Template Literal)
			const promptMessage = `
					Bitte evaluiere die folgende Frage aus unserer JSON-Anwendung für mein CISM-Training.

					Hier sind die Daten im JSON-Format:
					${JSON.stringify(questionData, null, 2)}

					Bitte liefere mir die Auswertung als sauberen HTML-Code (auf Deutsch). Verwende exakt folgende Struktur und Inline-Styles für die Schriftart (Arial, serifenlos), ohne Markdown-Code-Blöcke (kein \`\`\`html) um den Output:

					<div style="font-family: Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #333;">
							<h3 style="margin-bottom: 10px;">${questionData.question} (${questionData.domain})</h3>
							<ul style="list-style-type: none; padding-left: 0; margin-bottom: 15px;">
								<li><strong>Status:</strong> [Korrekt / Inkorrekt]</li>
								<li><strong>Deine Antwort:</strong> ${questionData.user} | <strong>Korrekte Antwort:</strong> ${questionData.correct}</li>
							</ul>
						<p>[Ausführliche Begründung auf Deutsch im Stil einer echten CISM-Prüfung, warum die richtige Antwort korrekt ist und warum die anderen Optionen (die subtilen Distraktoren) fehlerhaft sind...]</p>
					</div>
					`;
	
			console.log(promptMessage);
			
			showAlert(promptMessage);
			const response = await GeminiAPI.run({
				bodyPayload: promptMessage
			});

			showAlert("Evaluierung mit Gemini abgeschlossen ...");

			const parts = response.candidates?.[0]?.content?.parts;
			evaluationText = parts
				? parts.map(p => p.text).join('')
			: response.output;

			showAlert("Speicher Evaluierung in Datenbank ...");
			await InsertExplanation.run({
				qId: String(question._id),
				explText: evaluationText
			});
		}

		await storeValue("questionGeminiExplanation", evaluationText, false);
		//question.geminiExplanation = evaluationText;
		
		showAlert(evaluationText, "info");
		
		
		console.log("question id:", String(question._id));
		
		// 2. Führe die MongoDB-Query aus und übergebe die ID als Parameter
    const tagResult = await FindTags.run({ 
      questionId: String(question._id) 
    });
		
		console.log("tags: ", tagResult);
		
		await storeValue("tagsId", question._id, false);
		if (tagResult && tagResult.lenght > 0) {
			await storeValue("tagsList",tagResult[0].tags, false);
			console.log("appsmith.store.tagsList", appsmith.store.tagsList);
		} else {
			removeValue("tagsList");
		}
		
		return question;
	},
	
/*
	
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
	
	*/

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
	
	// Initialisiert den Chat mit der ersten Auswertung/Kontext
  initChat: async () => {
    // Initialisiere die Historie mit der ersten Auswertung als System-Kontext 
    // und einer ersten Begrüßung oder Instruktion
		const geminiOpinion = appsmith.store.questionGeminiExplanation;
		
		if (geminiOpinion === undefined || geminiOpinion === null || geminiOpinion.trim() === "")  
			{
				return null;
			}
		
		const initialAnalysisText = geminiOpinion.replace(/<[^>]*>?/gm, ''); // Entfernt alle HTML-Tags
		
    const initialHistory = [
      {
        role: "user",
        parts: [{ text: "Hier ist die initiale Auswertung, auf deren Basis wir arbeiten werden:\n\n" + initialAnalysisText }]
      },
      {
        role: "model",
        parts: [{ text: "Verstanden. Ich habe die Auswertung analysiert. Welche Fragen hast du dazu?" }]
      }
    ];

    await storeValue("geminiChatHistory", initialHistory);
    await storeValue("geminiSystemContext", "Du bist ein präziser Analyse-Assistent. Antworte basierend auf der initial übergebenen Auswertung.");
  },

  // Gibt den aktuellen Verlauf für das List-Widget zurück
  getHistory: () => {
    return appsmith.store.geminiChatHistory || [];
  },

  sendMessage: async (userMessage) => {
    if (!userMessage || userMessage.trim() === "") return;
    
    // Prüfen, ob der aktive Chat-Key im Store existiert.
    if (!appsmith.store.gemini_chat_key) {
      await storeValue("gemini_chat_key", appsmith.store.gemini_key_free);
      await this.initChat();
    }

    let history = appsmith.store.geminiChatHistory || [];

    // 1. Nutzer-Nachricht anhängen
    history.push({
      role: "user",
      parts: [{ text: userMessage }]
    });

    await storeValue("geminiChatHistory", history);

    try {
      // 2. API-Aufruf mit automatischer Key-Wechsel-Logik ausführen
      await this.executeWithKeyFallback(history);

      // 3. Gestaffeltes Scrollen nach unten, sobald Gemini geantwortet hat
      [200, 500, 800].forEach(delay => {
        setTimeout(() => {
          try {
            const editorBody = document.querySelector(".t--widget-richtexteditorwidget .ql-editor") || 
                               document.querySelector(".rich-text-editor .ql-editor") ||
                               document.querySelector(".ql-editor");
            if (editorBody) {
              editorBody.scrollTop = editorBody.scrollHeight;
            }
          } catch (e) {}
        }, delay);
      });

    } catch (error) {
      showAlert("Fehler bei der Kommunikation mit Gemini: " + error.message, "error");
    }
  },

  // Hilfsfunktion: Versucht den API-Call und schaltet bei Quota-Fehler auf den kostenpflichtigen Key um
  executeWithKeyFallback: async (history) => {
    try {
      // Erster Versuch mit dem aktuellen gemini_chat_key
      await this.runApiCall(history);
    } catch (error) {
      const errorMsg = error.message || JSON.stringify(error);
      const isQuotaError = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");

      // Prüfen, ob der Fehler vom kostenlosen Key stammt (wir also gerade den free-Key genutzt haben)
      const isUsingFreeKey = (appsmith.store.gemini_chat_key === appsmith.store.gemini_key_free);

      if (isQuotaError && isUsingFreeKey) {
        showAlert("Kostenloses Kontingent erschöpft. Schalte auf den kostenpflichtigen Key um...", "warning");
        
        // Den funktionierenden Key im Store auf den kostenpflichtigen Key umschalten
        await storeValue("gemini_chat_key", appsmith.store.gemini_key);

        try {
          // Zweiter Versuch mit dem neuen (kostenpflichtigen) Key
          await this.runApiCall(history);
          showAlert("Erfolgreich auf den kostenpflichtigen Key gewechselt.", "success");
        } catch (paidError) {
          throw new Error("Auch der kostenpflichtige Key ist fehlgeschlagen: " + paidError.message);
        }
      } else {
        throw error; // Anderen Fehler direkt weiterwerfen
      }
    }
  },

// Kleinere Hilfsfunktion für den eigentlichen Run und das Speichern der Antwort
  runApiCall: async (history) => {
    const apiResult = await GeminiAPIChat.run({ 
      systemContext: appsmith.store.geminiSystemContext,
      chatHistory: history 
    });

    // In Appsmith steckt die eigentliche API-Antwort oft in .data oder direkt im Objekt
    const responseObj = apiResult?.data || apiResult;

    // Extrahiere den Text sicher aus der Kandidaten-Struktur
    const botReply = responseObj?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!botReply) {
      // Falls Google einen Fehler im JSON zurückgibt
      const apiErrorMsg = responseObj?.error?.message || JSON.stringify(responseObj) || "Keine Antwort erhalten.";
      throw new Error(apiErrorMsg);
    }

    // Bot-Antwort an die Historie anhängen
    history.push({
      role: "model",
      parts: [{ text: botReply }]
    });

    await storeValue("geminiChatHistory", history);
  },
	
	getFormattedHistoryForRTE: () => {
    const history = appsmith.store.geminiChatHistory || [];
    const visibleHistory = history.slice(2);

    if (visibleHistory.length === 0) {
      return "<p style='color: #666; font-style: italic;'>Noch keine Nachrichten vorhanden. Starte den Chat...</p>";
    }

    // KEIN .reverse() -> Chronologische Reihenfolge (Neueste Nachricht landet automatisch unten)
    return visibleHistory.map(msg => {
      const isUser = msg.role === 'user';
      const sender = isUser ? '<b>Du:</b>' : '<b style="color: #2b6cb0;">Gemini:</b>';
      const bgColor = isUser ? '#f7fafc' : '#ebf8ff';
      
      const text = msg.parts?.[0]?.text || '';
      const formattedText = text.replace(/\n/g, '<br>');

      return `
        <div style="background-color: ${bgColor}; border-left: 4px solid ${isUser ? '#cbd5e0' : '#3182ce'}; padding: 10px 15px; margin-bottom: 12px; border-radius: 4px;">
          <p style="margin: 0 0 5px 0; font-family: Arial, sans-serif; font-size: 11px; color: #333;">${sender}</p>
          <div style="margin: 0; font-family: Arial, sans-serif; font-size: 12px; line-height: 1.4;">${formattedText}</div>
        </div>
      `;
    }).join('');
  },
	
	// Gibt den sichtbaren Verlauf (ohne System-Kontext) chronologisch zurück
	getVisibleHistory: () => {
		const history = appsmith.store.geminiChatHistory || [];
		return history.slice(2);
	},
	
	// Bereitet die Chat-Historie für das Custom Widget flach auf
	getChatForCustomWidget: () => {
		const history = appsmith.store.geminiChatHistory || [];
		// Überspringt die ersten 2 System-Nachrichten und mappt es in ein simples Format
		return history.slice(2).map(msg => ({
			role: msg.role,
			text: msg.parts?.[0]?.text || ''
		}));
	},

  // Chat aufräumen beim Schließen
  clearChat: async () => {
    await storeValue("geminiChatHistory", []);
    await storeValue("geminiSystemContext", "");
  }
}