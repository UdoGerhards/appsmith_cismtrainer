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
		
		await storeValue("tagsId", String(qId), false);

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
  },
	
	updateTags: async () => {

		//showAlert("Udpate tags triggert!");
	
    // 1. Hole die questionId (als String)
    const idString = String(appsmith.store.tagsId || "");

    // 2. Validierung vorab
    if (!idString || idString === "undefined" || idString === "null") {
      //showAlert("Keine gültige questionId gefunden!", "error");
      return;
    }

    // 3. Hole die Tags primär aus dem Model des Custom Widgets (Name deines Widgets anpassen: tagsInput oder Custom1?)
    // Achtung im Code oben hast du 'tagsInput.model', weiter unten im Projekt hieß es oft 'Custom1.model'. 
    // Nutze hier den exakten Namen deines Custom Widgets!
    let tagsToSave = tagsInput.model ? tagsInput.model.tags : (appsmith.store.tagsList || []);
	  //await storeValue("tagsList", tagsToSave,false);

    try {
      // Fall A: Keine Tags mehr übrig -> Sollen wir den Eintrag komplett löschen?
      if (!tagsToSave || (Array.isArray(tagsToSave) && tagsToSave.length === 0)) {
        // Falls du den Datensatz bei 0 Tags komplett löschen willst:
        await DeleteTags.run({ questionId: idString });
        //await storeValue('tagsList', []);
        return;
      }

      // Fall B: Tags vorhanden -> Normales Update / Upsert ausführen
      const result = await UpdateTags.run({ 
        questionId: idString,
        tags: tagsToSave 
      });

      return result;
    } catch (error) {
      showAlert("Fehler beim Speichern: " + error.message, "error");
    }
  },
}