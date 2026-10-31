export default {

	setupPage: async() => {
		await removeValue("gemini_key_free");
		await removeValue("gemini_key");
		await removeValue("gemini_chat_key");
		await removeValue("geminiEvaluationResult");

		await this.loadAndSaveConfiguration();

		const domainResult = await GetDistinctDomain.run();

		if (domainResult && domainResult.values.length > 0) {
			const domainsRaw = domainResult.values;
			const domains = domainsRaw
					.map(domain => ({ name: domain }))
					// { numeric: true } sorgt dafür, dass Domain 1 vor Domain 4 einsortiert wird
					.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
					.map((item, idx) => ({
							id: idx,
							name: item.name
					}));
			
			console.log("Sorted domains: ", domains);
			
			const defaultSelected = domains.map(item => {
				return item.name;
			});
			
			await storeValue('selectedDomains', defaultSelected);
			console.log(defaultSelected);
		
			await storeValue("domains", domains, false);
			console.log("Domains ", domains);
		} else {
			//showAlert("No domains found!!", "warning");
			console.log("Domains ", domainResult);
		}

		this.initQuiz();
	},
	
	initQuiz: async() => {
		const questions = appsmith.store.currentQuestions;
		let idx = appsmith.store.currentIndex;
		
		await storeValue("question", questions[idx], false);
		console.log("Random question ", questions[idx]);
		
		this.initChat()
	},
	
	loadAndSaveConfiguration: async () => {
		try {
			// 1. MongoDB-Query ausführen (ersetze 'findConfiguration' mit dem tatsächlichen Namen deiner Query)
			const data = await loadConfiguration.run();

			// Prüfen, ob Daten vorhanden sind
			if (!data || !Array.isArray(data)) {
				//showAlert("Keine Konfigurationsdaten gefunden.", "warning");
				return;
			}

			// 2. Durch das Array iterieren und jeden Wert in den Store schreiben
			// Dabei nutzen wir den Wert aus 'name' als Store-Key und 'value' als Inhalt
			for (const item of data) {
				if (item.name) {
					//showAlert("Configuration - saving '"+item.name+"'", "success");
					await storeValue(item.name, item.value);
				}
			}

			//showAlert("Konfiguration erfolgreich in den Store geladen!", "success");

		} catch (error) {
			showAlert("Fehler beim Laden der Konfiguration: " + error.message, "error");
		}
	},
	
	nextQuestion: async() => {
		const questions = appsmith.store.currentQuestions;
		let idx = appsmith.store.currentIndex;
		if (idx < questions.length-1){
			idx += 1;

			await storeValue("currentIndex", idx, false);

			await storeValue("question", questions[idx], false);
			console.log("Random question ", questions[idx]);

			this.initChat();
		} else {
				await this.getResults();
				await navigateTo("Evaluation", {}, 'SAME_WINDOW');
			}
	},

	createAnswerList: () => {
		const questionObject = appsmith.store.question;

		const correct = questionObject.correct;
		const answersRaw = questionObject.answers;

		const answers = answersRaw.map(answer => {
			let obj = {
				text: answer.text,
				position: answer.type,
				isBold: answer.type === correct,
			};	
			return obj;
		});

		console.log("Answers ", answers);

		return answers;
	},

	initChat: async () => {
		// 1. Generiere den Prompt über deine bestehende Funktion
		const promptText = this.getGeminiStartPrompt();

		if (!promptText) {
			return null;
		}

		// 2. Erstelle die initiale Historie für den Gemini Chat
		const initialHistory = [
			{
				role: "user",
				parts: [{ text: promptText }]
			},
			{
				role: "model",
				parts: [{ text: "Ich habe die CISM-Prüfungsfrage mitsamt den Antwortoptionen und der korrekten Lösung erhalten. Bitte reiche jetzt deine Begründungen für die Optionen A bis D ein." }]
			}
		];

		// 3. Im Appsmith Store speichern
		await storeValue("geminiChatHistory", initialHistory);
		await storeValue("geminiSystemContext", "Du bist ein erfahrener ISACA CISM Fachexperte und Prüfungscoach.");

		showAlert("Chat initilisiert!");

		return true;
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
				let timer = setTimeout(() => {
					try {
						const editorBody = document.querySelector(".t--widget-richtexteditorwidget .ql-editor") || 
									document.querySelector(".rich-text-editor .ql-editor") ||
									document.querySelector(".ql-editor");
						if (editorBody) {
							editorBody.scrollTop = editorBody.scrollHeight;
							// Sobald es geklappt hat: Alle nachfolgenden Timeouts stoppen
						}
					} catch (e) {}
				}, delay);
			});

		} catch (error) {
			showAlert("Fehler bei der Kommunikation mit Gemini: " + error.message, "error");
		}

		UserInput.setValue("");
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

		//await storeValue("geminiChatHistory", history);

		// --- NEU: Prüfen, ob Gemini die finale ISACA-Auswertung (Schritt 3) geliefert hat ---
		//if (botReply.includes("<!--ISACA, START-->") || botReply.includes("Offizielle ISACA-Erklärung")) {
		if (botReply.includes("==ISACA_START==")) {
			// Ruft deine Extraktions- und Speicherfunktion auf
			showAlert("Transforming gemini reply to HTML!", "info");
			await this.extractAndSaveExplanation(botReply, history);
		} else {
			showAlert("Transforming of gemini reply failed!", "warning");
			history.push({
				role: "model",
				parts: [{ text: botReply }]
			});
			await storeValue("geminiChatHistory", history);		
		}
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

	getGeminiStartPrompt:() => {

		const questionObject = appsmith.store.question;
		const questionText = questionObject.question;
		const correct = questionObject.correct;
		const answersRaw = questionObject.answers;

		let correctAnswer = null;

		const answers = answersRaw.map(answer => {
			let obj = {
				text: answer.text,
				position: answer.type,
				isCorrect: answer.type === correct,
			};	

			if (obj.isCorrect) {
				correctAnswer = obj.position;
			}

			return obj;
		});

		//console.log("Answers ", answers);
		//console.log("Correct answer ", correctAnswer);

		const options = answers.map(answer => {
			return answer.position + ". "+answer.text;
		});

		//console.log("Options ", options);
		
		const cismCoachPrompt = `
				Du bist ein erfahrener ISACA CISM (Certified Information Security Manager) Fachexperte und Prüfungscoach. Deine Aufgabe ist es, mich bei der Prüfungsvorbereitung durch ein interaktives Verfahren zu unterstützen.

				Bitte halte dich strikt an folgende Regeln:

				1. ABLAUF – SCHRITT 1 (Empfang von Frage & Lösung):
				- Am Ende dieser Nachricht findest du eine CISM-Prüfungsfrage mitsamt Antwortoptionen (A, B, C, D) sowie den korrekten Lösungsbuchstaben.
				- Deine Aufgabe in Schritt 1: Bestätige mir NUR kurz den Empfang der Frage und fordere mich auf, meine eigenen Begründungen für die Optionen A bis D einzureichen.
				- WICHTIG: Gib in Schritt 1 KEINERLEI inhaltliche Auswertungen, Hinweise, Tipps oder Erklärungen ab!

				2. ABLAUF – SCHRITT 2 (Vollständigkeitsprüfung deiner Begründungen):
				- In meiner nächsten Nachricht werde ich dir meine Begründungen senden (warum jede Option A, B, C, D richtig oder falsch ist).
				- Prüfe meine Eingabe auf Vollständigkeit: Habe ich zu ALLEN vier Antwortoptionen (A–D) eine Begründung abgegeben?
				- Falls Begründungen fehlen: Weise mich kurz darauf hin, welche Option noch fehlt, und warte auf meine Ergänzung. Gib noch KEINE Auswertung ab.

				3. ABLAUF – SCHRITT 3 (Detaillierte Evaluierung & ISACA-Erklärung):
				Erst wenn alle Optionen (A–D) vollständig begründet wurden, erstellst du die Auswertung. Gib die Antwort genau in den folgenden Abschnitten aus.

				WICHTIGE FORMATIERUNGSREGELN FÜR SCHRITT 3:
				- Jede Section MUSS durch eine Leerzeile von der vorherigen getrennt sein.
				- Jede Überschrift MUSS fett dargestellt werden (**Überschrift**).
				- Der jeweilige Text MUSS immer in der nächsten Zeile direkt unter der Überschrift beginnen.
				- Verwende keine Nummerierungen wie a), b), c).

				Gliedere deine Antwort in Schritt 3 exakt so:

				**Feedback zu meiner Begründung:**
				==FEEDBACK_START==
				Bewerte meine Argumentation zu jeder Option (A–D) ausführlich und spiegle sie am "ISACA Mindset".
				==FEEDBACK_END==

				**Offizielle ISACA Erklärung:**
				==ISACA_START==
				Erläutere hier die offizielle ISACA-Erklärung und vertiefe die zugrundeliegenden ISACA-Konzepte.
				==ISACA_END==

				**Korrekte Antwort:**
				==KORREKT_START==
				A
				==KORREKT_END==
				(Gib innerhalb dieser Tags ausschließlich den Buchstaben der korrekten Antwort an, z.B. A, B, C oder D).

				**CISM-Tags:**
				==TAGS_START==
				Nenne hier die offizielle CISM-Domäne sowie 3-5 prägnante Schlagworte/Tags.
				==TAGS_END==

				**Auswertung:**
				==AUSWERTUNG_START==
				korrekt
				==AUSWERTUNG_END==
				(Gib innerhalb der Tags ausschließlich das Wort "korrekt" oder "falsch" an, je nachdem ob deine Begründungen und die gewählte Antwort inhaltlich richtig waren.)

				4. ABLAUF – SCHRITT 4 (Vertiefender Dialog):
				Nach Schritt 3 bleibt der Chat für meine Ergänzungs- und Vertiefungsfragen geöffnet, die du weiterhin streng aus ISACA-CISM-Perspektive beantwortest.

				--- Hier ist die Frage für diesen Chat ---

				Frage:
				${questionText}

				Optionen:
				${options.join('\n')}

				Korrekte Antwort:
				${correctAnswer}
				`.trim();

		console.log("Gemini prompt "+cismCoachPrompt);

		return cismCoachPrompt;
	},

	extractAndSaveExplanation: async (geminiResponseText, history) => {
		if (!geminiResponseText) return null;

		const extractBlock = (startTag, endTag) => {
			const regex = new RegExp(`${startTag}([\\s\\S]*?)${endTag}`, 'i');
			const match = geminiResponseText.match(regex);
			return match ? match[1].trim() : null;
		};
		
		const textArr = [];

		// Feedback
		const feedBackHeader = "<h3>Feedback zu Deiner Begründung:</h3>";
		const feedBack = extractBlock('==FEEDBACK_START==','==FEEDBACK_END==');
		//showAlert(feedBack, "info");
		textArr.push(this.createArticle(feedBackHeader, feedBack ));

		console.log("Feedback from gemini ", feedBack);

		// ISACA Explanation
		const officialExplanationHeader = "Offizielle ISACA Erklärung:";
		const officialExplanation = extractBlock('==ISACA_START==', '==ISACA_END==');
		//showAlert(officialExplanation, "info");
		textArr.push(this.createArticle(officialExplanationHeader, officialExplanation));

		console.log("Official ISACA-Explanation: ", officialExplanation);

		// CISM Tags
		const cismTagsHeader = "CISM-Tags:";
		const cismTags = extractBlock('==TAGS_START==', '==TAGS_END==');
		//showAlert(cismTags, "info");
		textArr.push(this.createArticle(cismTagsHeader, cismTags));

		console.log("Tags: ", cismTags);

		const tagIDs = await this.processTags(cismTags);
		console.log("Query tag IDs: ", tagIDs);
		const queryUpdateResult = await this.updateQuestionTags(tagIDs);
		console.log("Question updated: ", queryUpdateResult);

		// Evaluation
		const evaluationHeader = "Auswertung:";
		let evaluation = extractBlock('==AUSWERTUNG_START==', '==AUSWERTUNG_END==');

		let color = "#FF0000";
		let evaluationResult = false;
		if (evaluation === "korrekt") {
			color = "#008000";
			evaluationResult = true;
		}
		
		let korrektAnswer = extractBlock('==KORREKT_START==', '==KORREKT_END==');
		console.log("Evaluation result: ", evaluationResult);
		console.log("Korrekte Antwort: ", korrektAnswer);
		await this.saveEvalutationResultToQuestion(evaluationResult, korrektAnswer);
		
		showAlert(evaluation, "info");
		evaluation = evaluation.toUpperCase();
		evaluation = `<span style="color: ${color};">${evaluation}</span>`;
		console.log("Evaluation: ", evaluation);
		textArr.push(this.createArticle(evaluationHeader, evaluation));

		const botReply = textArr.join("");

		history.push({
			role: "model",
			parts: [{ text: botReply }]
		});

		await storeValue("geminiChatHistory", history);

		// Objekt für deine Collection / DB / Store vorbereiten
		const explanationRecord = {
			questionId: appsmith.store.question?._id,
			explanationText: officialExplanation,
		};

		console.log("Extrahierte ISACA-Erklärung:", explanationRecord);

		// Beispiel 1: Im Appsmith Store ablegen
		//await storeValue("savedIsacaExplanation", explanationRecord);

		const qId = explanationRecord.questionId;
		//const text = explanationRecord.explanationText;

		// 1. Suchen, ob das Dokument existiert
		const searchResult = await FindMasterQueryExplanation.run({ questionId: qId });
		const documents = searchResult?.cursor?.firstBatch || searchResult;
		const exists = Array.isArray(documents) && documents.length > 0;

		// 3. Insert ausführen
		try {
			const result = await InsertMasterQueryExplanation.run({ 
				questionId: qId, 
				explanation: officialExplanation 
			});
			//showAlert("Explanation saved!!!", "info");
		} catch(e) {
			console.log("Error on insert explanation: ", e);
			//showAlert("Error on insert explanation: "+e, "Warning");		
		}

		// Beispiel 2: In eine MongoDB-Collection oder API schreiben (Hier deinen Query-Aufruf einfügen)
		// await insertIntoMyMongoDBCollection.run(explanationRecord);

		return explanationRecord;
	},

	createArticle: (header, body) => {
		return `<article style="margin-bottom: 20px"><h3 style="margin-bottom:5px">${header}</h3>${body}</article>`;
	},

	async processTags(rawTagsString) {
		// 1. Tag-String in ein sauberes, eindeutiges Array umwandeln
		const tagsArray = [...new Set(
			rawTagsString
			.split(',')
			.map(tag => tag.trim())
			.filter(tag => tag.length > 0)
		)];

		console.log("Tags to save: ", tagsArray);

		const tagIds = [];

		// 2. Durch jedes Tag iterieren
		for (const tagName of tagsArray) {

			// Schritt A: Nachschauen, ob das Tag bereits existiert (Query: FindTag)
			const existingTags = await FindTag.run({ tagName: tagName });

			let tagId;

			if (existingTags && existingTags.length > 0) {

				console.log(`Tag ${tagName} found in collection!`);
				// Fall 1: Tag ist bereits vorhanden -> ID übernehmen
				tagId = existingTags[0]._id;
				// Funktionierende Interpolation (mit Backticks):
				console.log(`Tag ID is ${tagId}!`);

			} else {
				console.log(`Saving ${tagName} in collection!`);
				// Fall 2: Tag existiert noch nicht -> Neu anlegen (Query: InsertTag)
				const insertResult = await InsertTag.run({ tagName: tagName });

				const freshTags = await FindTag.run({ tagName: tagName });
				if (freshTags && freshTags.length > 0) {
					tagId = freshTags[0]._id;
				}

				console.log(`Tag ID is ${tagId}!`);
			}

			// 3. ID zum Ergebnis-Array hinzufügen, wenn erfolgreich ermittelt
			if (tagId) {
				tagIds.push(tagId);
			}
		}

		console.log("Tag ID array is ", tagIds);

		// Gibt das Array mit allen Object-IDs (bestehend & neu) an den Aufrufer zurück
		return tagIds;
	},

	// Funktion 2: Aktualisiert die jeweilige Frage und mergt alte & neue Tags
	async updateQuestionTags(newTagIds) {

		//showAlert("Updating Question with new tags", "info");

		const questionDoc = appsmith.store.question;

		if (!questionDoc || !questionDoc._id) {
			throw new Error("Kein gültiges Frage-Dokument übergeben!");
		}

		if (!newTagIds || newTagIds.length == 0) {
			console.log("No tags saved! Due to this there is no need to update the question!");
			return true;
		}

		console.log("Question to modify: ", questionDoc);

		// A: Bereits vorhandene Tags aus der Frage holen (falls vorhanden)
		const existingTags = questionDoc.tags || [];
		console.log("Existing tag IDs ", existingTags);
		//showAlert("Existing tags length "+existingTags.length, "info");

		// B: Altes und neues Array mergen und Duplikate (als String verglichen) entfernen
		const mergedTagsSet = new Set([
			...existingTags.map(id => id.toString()),
			...newTagIds.map(id => id.toString())
		]);

		const finalTagIds = Array.from(mergedTagsSet);

		console.log("Merged tag IDs ", finalTagIds);
		//showAlert("Tags array length "+finalTagIds.length, "info");

		// C: Anhand des 'origin'-Parameters die richtige Collection-Query auswählen
		const questionId = questionDoc._id;
		const origin = questionDoc.origin;
		let updateResult;

		if (origin === "iquestion") {
			console.log("Saving tags in iquestion!", finalTagIds);
			updateResult = await UpdateIQuestion.run({ 
				questionId: questionId, 
				tags: finalTagIds 
			});
		} else if (origin === "gemini_query") {
			console.log("Saving tags in gemini_query!", finalTagIds);
			updateResult = await UpdateGeminiQuestion.run({ 
				questionId: questionId, 
				tags: finalTagIds 
			});
		} else {
			// Fallback für "question"
			console.log("Saving tags in question!", finalTagIds);
			updateResult = await UpdateQuestion.run({ 
				questionId: questionId, 
				tags: finalTagIds 
			});
		}

		console.log("Update result ", updateResult);
		return {
			success: true,
			origin: origin,
			questionId: questionId,
			updatedTags: finalTagIds,
			result: updateResult
		};
	},
	
	saveEvalutationResultToQuestion: async (result, answer) => {
	
		const questions = appsmith.store.currentQuestions;
		//console.log("Questions: ", questions);
		const idx = appsmith.store.currentIndex;
		//console.log("idx: ", idx);
		
		questions[idx].isCorrect = result;
		questions[idx].userAnswer = answer;

		//console.log("Result: ", result);
		//console.log("Correct answers: ", result);
		
		await storeValue("currentQuestions", questions, false);
	},
	
	getResults: async () => {
		const questions = appsmith.store.currentQuestions || [];

		console.log(questions);

		// 1. Zähle die korrekten Antworten (Feld 'correct' ist true)
		const correctCount = questions.filter(q => q.isCorrect === true).length;

		// 2. Zähle den Rest (Feld 'correct' ist false ODER existiert nicht)
		const incorrectCount = questions.filter(q => q.isCorrect !== true).length;

		const questioncount = appsmith.store.nrquestions;
		
		const start = appsmith.store.start;
		const end = new Date();
		
		const differenzMs = end - start; // Subtraktion zweier Date-Objekte liefert Millisekunden
		const minutes = Math.floor(differenzMs / (1000 * 60));

		const report = {
			"questions": questions,
			"correct": correctCount,
			"incorrect": incorrectCount,
			"name": appsmith.store.title,
			"test_executed_by": appsmith.store.user,
			"finsihed": moment().format("DD.MM.YYYY HH:mm"),
			"nature": appsmith.store.nature,
			"questioncount": questioncount,
			"minutes": minutes,
			"domains": appsmith.store.domains
		};

		storeValue('report', report, false);
		console.log(report);
	}
}