export default {

	logResults: async() => {
		
		await removeValue("gemini_key_free");
		await removeValue("gemini_key");
		await removeValue("gemini_chat_key");
		
		await this.loadAndSaveConfiguration();

		await GetDomain.run();

		const report = appsmith.store.report;

		const questions = appsmith.store.report.questions;
		//console.log("Initial questions: ", questions);
		const questionsWithMeta = await this.getQuestionMeta(questions);

		report.questions = questionsWithMeta;

		const secondsLeft = Number(appsmith.store.timeLeft);
		const totalSeconds = Number(report.minutes) * 60;

		console.log("Seconds left", secondsLeft);

		if (!isNaN(secondsLeft)) {

			report.durationTest = totalSeconds - secondsLeft;

			const totalTime = Number(report.durationTest);
			const questionCount = Number(report.questioncount);
			const avgMinutes  = totalTime / questionCount;

			report.averageDurationPerQuestion = Math.round(avgMinutes);

		} else {
			report.timeLeft = -1;
			report.averageDurationPerQuestion = -1;
		}
		await storeValue('report', report, false);
		//console.log(report);
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

	getQuestionMeta: async(questions) =>{
		const ids = questions.map(item => item._id);

		try {
			const metadata = await BookmarkCommentLookup.run({ ids: ids });

			//console.log("Erfolgreich geladen:", metadata);

			const questionsWithMeta = questions.map(q => {
				// 1. Passenden Eintrag in den Metadaten suchen
				const meta = metadata.find(m => m._id?.toString() === q._id?.toString());

				// 2. Werte berechnen (Ja/Nein-Werte)
				const isBookmarked = meta?.hasBookmark === true;
				const hasComment = meta?.commentText && meta?.commentText.trim().length > 0;

				// 3. WICHTIG: Das neue Objekt zurückgeben!
				return {
					...q,                       // Kopiert alle alten Felder der Frage (z.B. Text, Kategorie)
					isBookmarked: isBookmarked, // Fügt das neue Lesezeichen-Feld hinzu
					hasComment: hasComment,     // Fügt das neue Kommentar-Feld hinzu
					commentText: meta?.commentText || "" // Optional: Den Text des Kommentars direkt mitgeben
				};
			});

			//console.log("Enriched questions: ", questionsWithMeta);
			return questionsWithMeta;

		} catch (error) {
			// Fehler abfangen, falls die Query fehlschlägt
			//console.error("Fehler beim Laden der Fragen:", error);
			return questions;
		}
	},
	getTableData: () => {
		const questions = appsmith.store.report.questions || [];

		// 2. Hole die bereits geladenen Daten aus deiner Query
		const metadata = BookmarkCommentLookup.data || [];

		// 3. Fragen nach Domain sortieren, damit sie gruppiert erscheinen
		const sortedQuestions = [...questions].sort((a, b) => {
			const domainA = (a.domain || "").toLowerCase();
			const domainB = (b.domain || "").toLowerCase();
			if (domainA < domainB) return -1;
			if (domainA > domainB) return 1;
			return 0;
		});

		// 4. Daten für die Tabelle mappen
		return sortedQuestions.map(q => {

			const answers = q.answers;
			const correctAnswer = answers.filter(item => item.type.trim() === q.correct.trim())[0];

			// Finde die passenden Metadaten für die aktuelle Frage aus der Query
			const meta = metadata.find(m => m._id?.toString() === q._id?.toString());

			let userAnswer = null;
			let isCorrect = false;
			if (q.userAnswer !== undefined) {
				userAnswer = answers.filter(item => item.type.trim() === q.userAnswer.trim())[0].text;
				isCorrect = q.correct.trim() == q.userAnswer.trim();
			}

			return {
				"Domain": q.domain || "Allgemein",
				"Frage": q.question,
				"Richtige Antwort": correctAnswer.text,
				"User Antwort": userAnswer,
				"isCorrect": isCorrect ? "✅" : "❌",
				// Werte aus der Query verwenden
				"Bookmark": meta?.hasBookmark ? "⭐" : "",
				"Kommentare": meta?.commentText || "",
				"id": q._id
			};
		});
	},

	// NEUE FUNKTION HIER EINZUFÜGEN:
	onAllQuestionsChange: async () => {
		// Diese Zeile zwingt Appsmith, die Daten neu zu berechnen
		await EvaluationSource.getWrongAnswers();
	},

	getWrongAnswers: () => {
		const questions = appsmith.store.report.questions || [];

		// 2. Fragen nach Domain sortieren
		const sortedQuestions = [...questions].sort((a, b) => {
			const domainA = (a.domain || "").toLowerCase();
			const domainB = (b.domain || "").toLowerCase();
			if (domainA < domainB) return -1;
			if (domainA > domainB) return 1;
			return 0;
		});

		//console.log("Sorted questions: ", sortedQuestions);

		const allAktiv = all_questions.isSwitchedOn;
		let filteredQuestions = sortedQuestions;

		if (!allAktiv){
			// Falsche Antworten ODER markierte/kommentierte Fragen herausfiltern
			filteredQuestions = sortedQuestions.filter(q => {
				const isIncorrect = (q.userAnswer === undefined) || (q.correct.trim() !== q.userAnswer.trim());
				return isIncorrect;
			});
		} else {
			filteredQuestions = sortedQuestions;
		}

		/*
    // --- FILTER FÜR DAS INPUT-FELD ---
    const searchForm = (search.text || "").toLowerCase().trim();
		const domainSelect = (Select1.selectedOptionValue || "").toLowerCase().trim();

		console.log(domainSelect);

    if (searchForm !== "") {
      filteredQuestions = filteredQuestions.filter(q => {
        const questionText = (q.question || "").toLowerCase();
        const domainText = (q.domain || "").toLowerCase();
        return questionText.includes(searchForm) || domainText.includes(domainSelect);
      });
    }*/

		// --- FILTER FÜR DAS INPUT-FELD & SELECT ---
		const searchForm = (search.text || "").toLowerCase().trim();
		const domainSelect = (Select1.selectedOptionValue || "").toLowerCase().trim();

		filteredQuestions = filteredQuestions.filter(q => {
			const questionText = (q.question || "").toLowerCase();
			const domainText = (q.domain || "").toLowerCase();

			// Prüfen, ob Suchtext passt (oder leer ist)
			const matchesSearch = searchForm === "" || questionText.includes(searchForm);

			// Prüfen, ob Domain passt (oder leer/alle ist)
			const matchesDomain = domainSelect === "" || domainText === domainSelect;

			return matchesSearch && matchesDomain;
		});

		// 3. Daten für das List-Widget mappen und die ECHTEN DB-Werte anhängen
		const questionsToShow = filteredQuestions.map(q => {

			const answers = q.answers;
			let correctAnswer = "";
			const correctAnswerObject = answers.filter(item => item.type.trim() === q.correct.trim());
			if(Array.isArray(correctAnswerObject) && correctAnswerObject.length >0 ) {
				correctAnswer = correctAnswerObject[0].text;
			}

			let userAnswer = "";
			if (q.userAnswer !== undefined) {
				const userAnswerObject = answers.filter(item => item.type.trim() === q.userAnswer.trim());
				if (Array.isArray(userAnswerObject) && userAnswerObject.length > 0) {
					userAnswer = userAnswerObject[0].text;
				}
			}

			return {
				"Domain": q.domain || "Allgemein",
				"Frage": q.question,
				"Richtige Antwort": correctAnswer,
				"User Antwort": userAnswer,
				"Kommentar": q?.commentText || "",
				"Bookmark": q.hasBookmark,
				"id": q._id,
				"isCorrect": q.isCorrect
			};
		})

		//console.log("Questions to show:", questionsToShow);

		return questionsToShow;
	},


	// ... Ihre bisherigen Funktionen (getWrongAnswers, etc.) ...

	toggleBookmark: async (currentQuestion, chckBx) => {
		// //console.log(chckBx);
		const isChecked = chckBx.isChecked;

		// Die ID der aktuellen Frage aus der Liste holen
		const qId = currentQuestion.id; // Falls Ihr Feld anders heißt, z.B. q.questionId, hier anpassen

		if (isChecked) {
			// 1. Wenn die Checkbox AKTIVIERT wurde -> Insert ausführen
			await InsertBookmark.run({ qId: qId });
		} else {
			// 2. Wenn die Checkbox DEAKTIVIERT wurde -> Delete ausführen
			await DeleteBookmark.run({ qId: qId });
		}

		//await EvaluationSource.refreshData();

		// 3. WICHTIG: Die Liste neu laden, damit die Änderungen sofort sichtbar sind
		//await EvaluationSource.getWrongAnswers();
	},

	saveComment: async (currentQuestion, newCommentTextObj) => {
		const newCommentText = newCommentTextObj.text;
		// //console.log(newCommentText);

		const qId = currentQuestion.id; // Nutze .id oder ._id je nach Datenstruktur
		const cleanComment = (newCommentText || "").trim();

		// 1. Zuerst prüfen, ob bereits ein Eintrag in MongoDB existiert
		const existingComments = await FindComment.run({ qId: qId });
		const hasExistingEntry = existingComments && existingComments.length > 0;

		// Logik-Weichen abfahren
		if (cleanComment.length > 0) {
			if (!hasExistingEntry) {
				// VORGABE 1: Kein Wert in Collection + Text da -> Neu anlegen
				await InsertComment.run({
					qId: qId,
					comment: cleanComment
				});
				showAlert("Kommentar erfolgreich erstellt!", "success");
			} else {
				// VORGABE 2: Wert existiert + Text da -> Update ausführen
				await UpdateComment.run({
					qId: qId,
					comment: cleanComment
				});
				showAlert("Kommentar erfolgreich aktualisiert!", "success");
			}
		} else {
			// VORGABE 3: CleanComment ist leer -> Eintrag löschen (falls einer existiert)
			if (hasExistingEntry) {
				await DeleteComment.run({
					qId: qId
				});
				showAlert("Kommentar gelöscht.", "info");
			}
		}
	},

	/*
   * Helper function: Create PIEChart
   */
	prepareTestChart: () => {
		const report = appsmith.store.report;

		// Sicherheitscheck für den Store (Liefert leeres Objekt, falls noch nicht geladen)
		if (!report) {
			return {};
		}

		// Werte auslesen und sicherstellen, dass es Zahlen sind (Fallback auf 0)
		const correctCount = report.correct || 0;
		const incorrectCount = report.incorrect || 0;

		// WICHTIG: Das hier ist die korrekte Apache E-Charts Struktur für ein Pie-Chart.
		// (Hinweis: Ihr vorheriger Code enthielt FusionCharts-Syntax, E-Charts nutzt folgende Struktur)
		return {
			title: {
				text: 'Ergebnis',
				left: 'center'
			},
			tooltip: {
				trigger: 'item'
			},
			legend: {
				orient: 'horizontal', // 'horizontal' sieht unten meist besser aus, 'vertical' geht aber auch
				left: 'left',       // Richtet die Legende am linken Rand aus
				bottom: 'bottom'    // Platziert die Legende am unteren Rand
			},
			series: [
				{
					name: 'Antworten',
					type: 'pie',
					radius: '50%',
					// Farben direkt für die Segmente definieren (Grün und Rot)
					color: ['#22C55E', '#EF4444'],
					data: [
						{ value: correctCount, name: 'Korrekte Antworten' },
						{ value: incorrectCount, name: 'Inkorrekte Antworten' }
					],
					emphasis: {
						itemStyle: {
							shadowBlur: 10,
							shadowOffsetX: 0,
							shadowColor: 'rgba(0, 0, 0, 0.5)'
						}
					}
				}
			]
		};
	},

	getDomain1: () => {
		const dom = 'Domain 1 – Information Security Governance';
		return this.prepareDomainTestChart(dom);
	},

	getDomain2: () => {
		const dom = 'Domain 2 – Information Risk Management';
		return this.prepareDomainTestChart(dom);
	},

	getDomain3: () => {
		const dom = 'Domain 3 – Information Security Program Development and Management';
		return this.prepareDomainTestChart(dom);
	},

	getDomain4: () => {
		const dom = 'Domain 4 – Information Security Incident Management';
		return this.prepareDomainTestChart(dom);
	},

	prepareDomainTestChart: (selectedDomain) => {
		const report = appsmith.store.report;

		// Sicherheitscheck für den Store (Liefert leeres Objekt, falls noch nicht geladen)
		if (!report || !report.questions) {
			return {};
		}

		// Fragen nach Domain filtern (wenn eine ausgewählt ist und nicht "Alle" o.ä.)
		const questions = report.questions;
		const filteredQuestions = selectedDomain && selectedDomain !== "Alle"
		? questions.filter(q => (q.domain || "").toLowerCase() === selectedDomain.toLowerCase())
		: questions;

		// Korrekte und inkorrekte Antworten für die gefilterten Fragen berechnen
		let correctCount = 0;
		let incorrectCount = 0;

		filteredQuestions.forEach(q => {
			if (q.userAnswer !== "" && q.correct !== "") {
				if (q.correct === q.userAnswer) {
					correctCount++;
				} else {
					incorrectCount++;
				}
			} else {
				// Falls nicht beantwortet, als falsch werten (optional, je nach Logik)
				incorrectCount++;
			}
		});


		// Apache E-Charts Struktur zurückgeben
		return {
			title: {
				text: selectedDomain,
				left: 'center'
			},
			tooltip: {
				trigger: 'item'
			},
			legend: {
				orient: 'horizontal', // 'horizontal' sieht unten meist besser aus, 'vertical' geht aber auch
				left: 'left',       // Richtet die Legende am linken Rand aus
				bottom: 'bottom'    // Platziert die Legende am unteren Rand
			},
			series: [
				{
					name: 'Antworten',
					type: 'pie',
					radius: '50%',
					color: ['#22C55E', '#EF4444'],
					data: [
						{ value: correctCount, name: 'Korrekte Antworten' },
						{ value: incorrectCount, name: 'Inkorrekte Antworten' }
					],
					emphasis: {
						itemStyle: {
							shadowBlur: 10,
							shadowOffsetX: 0,
							shadowColor: 'rgba(0, 0, 0, 0.5)'
						}
					}
				}
			]
		};
	},

	processGeminiExplain: async(index) => {

		showAlert("Evaluierung mit Gemini!!");

		const questions = appsmith.store.report.questions;
		const currentData = this.getWrongAnswers()[index];


		if (!currentData) return;

		const question = questions.find(q => {
			return q._id === currentData["id"];
		});

		console.log(question);

		const existingResult = await FindExplanation.run({
			qId: String(question._id)
		});

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
		question.geminiExplanation = evaluationText;

		resetWidget("InputUserMsg");
		showModal(Modal_Explanation.name);

		return question;
	},

	handleSaveAndNavigate: async() => {
		try {
			await EvaluationSource.saveReportToMongo();
			navigateTo('Home');
		} catch (error) {
			showAlert("Fehler beim Speichern: " + error.message, "error");
		}
	},

	saveReportToMongo: async() => {
		// 1. Prüfen, ob das Objekt überhaupt im Store existiert
		if (!appsmith.store.report) {
			showAlert("Kein Report-Objekt im Store gefunden!", "warning");
			return;
		}

		const report = appsmith.store.report;
		const { questions, ...reportMetadata } = report;
		const reportToSave = {
			...reportMetadata,
			questions: questions.map(({ userAnswer, isCorrect, _id }) => ({
				userAnswer,
				isCorrect,
				_id
			}))
		};

		await this.updateWrongQuestionCount(reportToSave.questions);

		await storeValue('reportToSave', reportToSave, false);

		try {
			// 2. Die MongoDB-Query triggern und auf den Erfolg warten
			await InsertTestResults.run({ reportData: reportToSave });

			// 3. Erfolgsmeldung für den Nutzer
			showAlert("Report erfolgreich in MongoDB gespeichert!", "success");

			// 4. (Optional) Den Store nach dem Speichern leeren
			// await removeValue("report");

		} catch (error) {
			// Fehler abfangen, falls die DB-Verbindung hakt
			showAlert("Fehler beim Speichern in MongoDB: " + error.message, "error");
		}
	},

	updateWrongQuestionCount: async(questions)  => {

		try {
			const ids = questions
			.filter(q => q.isCorrect === false) // 1. Nur die falschen Fragen behalten
			.map(q => q._id);                     // 2. Aus diesen Fragen nur die _id herausziehen

			await UpdateFalseRateQuestions.run({ids: ids});
		} catch (error) {
			//console.error(error);
		}
	},

	getResultAsPercent: () => {
		// KORREKTUR: Punkt statt Komma bei .questioncount
		const nrquestion = appsmith.store.report.questioncount;
		const correct = appsmith.store.report.correct;

		let result = "Berechnung nicht möglich!";

		// KORREKTUR: Sicherstellen, dass nrquestion existiert und größer als 0 ist
		if (nrquestion && nrquestion > 0 && typeof correct === 'number') {
			result = (correct / nrquestion).toLocaleString('de-DE', {
				style: 'percent',
				minimumFractionDigits: 0,
				maximumFractionDigits: 1
			});
		}
		return result;
	},

	startTestWithFalse: async() => {

		const report = appsmith.store.report;

		const falseQuestions = report.questions
		.filter(question => question.isCorrect === false)
		.map(question => {
			const questionCopy = { ...question }; // Erstellt eine sichere Kopie
			delete questionCopy.userAnswer;       // Löscht das Feld komplett
			delete questionCopy.isCorrect;        // Löscht das Feld komplett
			delete questionCopy.ID;
			return questionCopy;
		});


		//console.log(falseQuestions);

		const mins = Math.ceil(falseQuestions.length * 1.6);

		// 1. Alle Domains einsammeln (gibt eine Liste mit Duplikaten)
		const allDomains = falseQuestions.map(question => question.domain);

		// 2. Duplikate entfernen und wieder in ein normales Array umwandeln
		const uniqueDomains = [...new Set(allDomains)];

		//console.log("Wrong questions", falseQuestions);

		await storeValue('title', report.name, false);
		await storeValue('nrquestions', falseQuestions.length, false);
		await storeValue('mins', mins, false);
		await storeValue('nature', 'synthetic');
		await storeValue('domains', uniqueDomains, false);

		console.log(falseQuestions);

		const qstns = this.shuffleArray(falseQuestions);

		console.log(qstns);

		await storeValue("currentQuestions", falseQuestions);
		if (appsmith.store.currentIndex === undefined) {
			await storeValue("currentIndex", 0);
		}

		await navigateTo("Execution", {}, "SAME_WINDOW");
	},

	shuffleArray: (array) => {
		for (let i = array.length - 1; i > 0; i--) {
			// Zufälligen Index von 0 bis i wählen
			const j = Math.floor(Math.random() * (i + 1));
			// Elemente vertauschen (Destructuring Assignment)
			[array[i], array[j]] = [array[j], array[i]];
		}
		return array;
	},

	getDomains: () => {
		const rawData = GetDomain.data;

		console.log(rawData);

		let rawItems = [];
		if (Array.isArray(rawData)) {
			rawItems = rawData;
		} else if (rawData?.cursor?.firstBatch && Array.isArray(rawData.cursor.firstBatch)) {
			rawItems = rawData.cursor.firstBatch;
		}
		rawItems.unshift({_id: " "});

		const sortedData = [...rawItems].sort((a, b) => a._id.localeCompare(b._id));

		console.log(sortedData);

		return sortedData;
	},
	
// Initialisiert den Chat mit der ersten Auswertung/Kontext
  initChat: async () => {
    // Initialisiere die Historie mit der ersten Auswertung als System-Kontext 
    // und einer ersten Begrüßung oder Instruktion
		const geminiOpinion = RichTextEditor1.text;
		
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

// Nachricht senden und Antwort erhalten
  sendMessage: async (userMessage) => {
    if (!userMessage || userMessage.trim() === "") return;
    
    // Prüfen, ob der aktive Chat-Key im Store existiert. Wenn nicht, mit dem kostenlosen Key initialisieren.
    if (!appsmith.store.gemini_chat_key) {
      //await storeValue("gemini_key_free", "DEIN_KOSTENLOSER_API_KEY"); // Falls noch nicht geschehen
      //await storeValue("gemini_key", "DEIN_KOSTENPFLICHTIGER_API_KEY"); // Falls noch nicht geschehen
      
      // Starte standardmäßig mit dem kostenlosen Key
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
	
// Formatiert die Historie als schönes HTML für den Rich Text Editor (überspringt die ersten 2 Elemente)
	/*
  getFormattedHistoryForRTE: () => {
    const history = appsmith.store.geminiChatHistory || [];
    
    // Die ersten beiden Elemente (System-Prompt / Initialisierung) überspringen
    const visibleHistory = history.slice(2);

    if (visibleHistory.length === 0) {
      return "<p><i>Noch keine Nachrichten vorhanden. Starte den Chat...</i></p>";
    }

    // Generiert für jede sichtbare Nachricht einen sauberen HTML-Block
    return visibleHistory.map(msg => {
      const isUser = msg.role === 'user';
      const sender = isUser ? '<b>Du:</b>' : '<b style="color: #2b6cb0;">Gemini:</b>';
      const bgColor = isUser ? '#f7fafc' : '#ebf8ff'; // Leichtes Grau für User, helles Blau für Gemini
      
      const text = msg.parts?.[0]?.text || '';
      // Zeilenumbrüche für HTML erhalten
      const formattedText = text.replace(/\n/g, '<br>');

      return `
        <div style="background-color: ${bgColor}; border-left: 4px solid ${isUser ? '#cbd5e0' : '#3182ce'}; padding: 10px 15px; margin-bottom: 12px; border-radius: 4px;">
          <p style="margin: 0 0 5px 0;">${sender}</p>
          <div style="margin: 0; font-family: Arial, sans-serif; font-size: 13px; line-height: 1.4;">${formattedText}</div>
        </div>
      `;
    }).join('');
  },*/
	getFormattedHistoryForRTE: () => {
    const history = appsmith.store.geminiChatHistory || [];
    const visibleHistory = history.slice(2);

    if (visibleHistory.length === 0) {
      return "<p><i>Noch keine Nachrichten vorhanden. Starte den Chat...</i></p>";
    }

    // .reverse() sorgt dafür, dass die neuesten Nachrichten ganz oben stehen!
    return [...visibleHistory].reverse().map(msg => {
      const isUser = msg.role === 'user';
      const sender = isUser ? '<b>Du:</b>' : '<b style="color: #2b6cb0;">Gemini:</b>';
      const bgColor = isUser ? '#f7fafc' : '#ebf8ff';
      
      const text = msg.parts?.[0]?.text || '';
      const formattedText = text.replace(/\n/g, '<br>');

      return `
        <div style="background-color: ${bgColor}; border-left: 4px solid ${isUser ? '#cbd5e0' : '#3182ce'}; padding: 10px 15px; margin-bottom: 12px; border-radius: 4px;">
          <p style="margin: 0 0 5px 0; font-family: Arial, sans-serif; font-size: 11px;color: #333;">${sender}</p>
          <div style="margin: 0; font-family: Arial, sans-serif; font-size: 12px; line-height: 1.4;">${formattedText}</div>
        </div>
      `;
    }).join('');
  },

  // Chat aufräumen beim Schließen
  clearChat: async () => {
    await storeValue("geminiChatHistory", []);
    await storeValue("geminiSystemContext", "");
  }
}
