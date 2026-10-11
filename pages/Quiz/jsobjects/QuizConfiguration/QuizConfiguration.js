export default {
	
	setupPage: async() => {
		await removeValue("gemini_key_free");
		await removeValue("gemini_key");
		await removeValue("gemini_chat_key");
		await removeValue("geminiEvaluationResult");

		await this.loadAndSaveConfiguration();
		
		const domainResult = await GetDistinctDomain.run();
		
		if (domainResult && domainResult.values.length > 0) {
			const domains = domainResult.values;
			await storeValue("domains", domains, false);
			console.log("Domains ", domains);
		} else {
			showAlert("No domains found!!", "warning");
			console.log("Domains ", domainResult);
		}
		
		this.nextQuestion();
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
	
	nextQuestion: async() => {
		const result = await GetQuestion.run();
		if (result && result.length > 0) {
			const question = result[0];
			await storeValue("question", question, false);
			console.log("Random question ", question);
		} else {
			showAlert("No questions found!!", "warning");
			console.log("Random question ", result);
		}
		
		this.initChat();
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
	/*
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
	*/
	
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

		// --- NEU: Prüfen, ob Gemini die finale ISACA-Auswertung (Schritt 3) geliefert hat ---
		if (botReply.includes("---ISACA_START---") || botReply.includes("Offizielle ISACA-Erklärung")) {
			// Ruft deine Extraktions- und Speicherfunktion auf
			await this.extractAndSaveExplanation(botReply);
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
		
		console.log("Answers ", answers);
		console.log("Correct answer ", correctAnswer);
		
		const options = answers.map(answer => {
				return answer.position + ". "+answer.text;
		});

		console.log("Options ", options);
		
		const cismCoachPrompt =`
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
			 Erst wenn alle Optionen (A–D) vollständig begründet wurden, erstellst du die Auswertung basierend auf den offiziellen ISACA-CISM-Standards:
			 a) Feedback zu meiner Begründung: Bewerte meine Argumentation zu jeder Option (A–D) und spiegle sie am "ISACA Mindset".
			 b) Offizielle ISACA-Erklärung: Bestätige die Lösung und erläutere die zugrundeliegenden ISACA-Konzepte.

			 WICHTIG: Setze vor den Teil der offiziellen ISACA-Erklärung exakt diese Zeile als Trenner:
			 ---ISACA_START---

		4. ABLAUF – SCHRITT 4 (Vertiefender Dialog):
			 Nach Schritt 3 bleibt der Chat für meine Ergänzungs- und Vertiefungsfragen geöffnet, die du weiterhin streng aus ISACA-CISM-Perspektive beantwortest.

		--- Hier ist die Frage für diesen Chat ---

		Frage:
		${questionText}

		Optionen:
		${options}

		Korrekte Antwort:
		${correctAnswer}
		`.trim();
		
		console.log("Gemini prompt "+cismCoachPrompt);
		
		return cismCoachPrompt;
	},
	
	extractAndSaveExplanation: async (geminiResponseText) => {
    if (!geminiResponseText) return null;

    let officialExplanation = "";

    // Methode A: Wenn du den Trenner ---ISACA_START--- im Prompt verwendet hast
    if (geminiResponseText.includes("---ISACA_START---")) {
        const parts = geminiResponseText.split("---ISACA_START---");
        officialExplanation = parts[1] ? parts[1].trim() : "";
    } 
    // Methode B: Fallback, falls der Trenner fehlt (suche nach klassischer Überschrift)
    else if (geminiResponseText.includes("Offizielle ISACA-Erklärung")) {
        const parts = geminiResponseText.split(/Offizielle ISACA-Erklärung/i);
        officialExplanation = parts[1] ? parts[1].trim() : "";
    } else {
        officialExplanation = geminiResponseText; // Gesamten Text nehmen, wenn nichts gefunden
    }

    // Objekt für deine Collection / DB / Store vorbereiten
    const explanationRecord = {
        questionId: appsmith.store.question?.id || "unknown",
        explanationText: officialExplanation,
        createdAt: new Date().toISOString()
    };

    console.log("Extrahierte ISACA-Erklärung:", explanationRecord);

    // Beispiel 1: Im Appsmith Store ablegen
    await storeValue("savedIsacaExplanation", explanationRecord);

    // Beispiel 2: In eine MongoDB-Collection oder API schreiben (Hier deinen Query-Aufruf einfügen)
    // await insertIntoMyMongoDBCollection.run(explanationRecord);

    return explanationRecord;
	}
}