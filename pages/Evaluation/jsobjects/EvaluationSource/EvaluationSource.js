export default {

	logResults: async() => {

		await removeValue("gemini_key_free");
		await removeValue("gemini_key");
		await removeValue("gemini_chat_key");
		await removeValue("geminiEvaluationResult");

		await this.loadAndSaveConfiguration();

		await GetDomain.run();

		const report = appsmith.store.report;
		console.log("Loaded report: ", report);

		//console.log("Report ", report);

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
		
		report.finished = new Date();
		
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

	getTableData: () => {
		const questions = appsmith.store.report.questions || [];
		
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
				"id": q._id
			};
		});
	},
	
	getAnswerSet: async() => {
		const set = AnswerSet.selectedOptionValue
		showAlert("Choosen set: "+set, "info");
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
		
		let filteredQuestions = sortedQuestions;
		const answerSet = AnswerSet.selectedOptionValue;
		if (answerSet === "wrong") {
			// Get all wrong answered, default
				filteredQuestions = sortedQuestions.filter(q => {
					const isIncorrect = (q.userAnswer === undefined) || (q.correct.trim() !== q.userAnswer.trim());
					return isIncorrect;
			});
		} else if (answerSet === "correct") {
			  // Get all correct answered
				filteredQuestions = sortedQuestions.filter(q => {
					const isCorrect = (q.userAnswer === undefined) || (q.correct.trim() === q.userAnswer.trim());
					return isCorrect;
			});
		} else  {
			// All answers from the report
			filteredQuestions = sortedQuestions;
		}

		// if selected get bookmarked only
		const onlybookmarked = bookmarksonly.isSwitchedOn;
		if (onlybookmarked) {
			filteredQuestions = filteredQuestions.filter(q => {
				return q.hasBookmark;
			});
		} 


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
				"id": q._id,
				"isCorrect": q.isCorrect,
				"hasBookmark": q.hasBookmark
			};
		})

		console.log("Questions to show:", questionsToShow);

		return questionsToShow;
	},
	
	toggleBookmark: async (currentQuestion, chckBx) => {
			const isChecked = chckBx.isChecked;

			// ID sicher ermitteln (unterstützt _id als ObjectId/String sowie .id)
			const qId = currentQuestion._id ? currentQuestion._id.toString() : currentQuestion.id;

			// 1. Datenbank-Operationen ausführen
			if (isChecked && !currentQuestion.hasBookmark) {
				const result = await InsertBookmark.run({ qId: qId });
				showAlert("Saving bookmark!"+qId, "info");
				console.log("Result from setting bookmark ", result);
			} else if (!isChecked && currentQuestion.hasBookmark) {
				const result = await DeleteBookmark.run({ qId: qId });
				showAlert("Deleting bookmark: "+qId, "info");
				console.log("Result from setting bookmark ", result);
			} else {
				return;
			}

			const report = appsmith.store.report || {};
			const questionsList = report.questions || [];
			const updatedQuestions = questionsList.map(q => {
				const currentQId = q._id ? q._id.toString() : q.id;
				if (currentQId === qId) {
					return {
						...q,
						hasBookmark: isChecked // Setzt den neuen Bookmark-Status
					};
				}
				return q;
			});

			const updatedReport = {
				...report,
				questions: updatedQuestions // Falls es bei dir anders heißt (z.B. currentQuestions), hier anpassen
			};
			await storeValue("report", updatedReport, false);
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
		const dom = 'Domain 1 - Information Security Governance';
		return this.prepareDomainTestChart(dom);
	},

	getDomain2: () => {
		const dom = 'Domain 2 - Information Security Risk Management';
		return this.prepareDomainTestChart(dom);
	},

	getDomain3: () => {
		const dom = 'Domain 3 - Information Security Program Development and Management';
		return this.prepareDomainTestChart(dom);
	},

	getDomain4: () => {
		const dom = 'Domain 4 - Information Security Incident Management';
		return this.prepareDomainTestChart(dom);
	},

	prepareDomainTestChart: (selectedDomain) => {
		const report = appsmith.store.report;

		// Sicherheitscheck für den Store
		if (!report || !report.questions) {
			return {
				graphic: {
					type: 'text',
					left: 'center',
					top: 'middle',
					style: {
						text: 'Keine Daten geladen',
						fill: '#9CA3AF',
						fontSize: 14
					}
				}
			};
		}

		// Hilfsfunktion: Vereinheitlicht Gedankenstriche (En-Dash) und Bindestriche
		const normalize = str => (str || "").replace(/[–—]/g, "-").toLowerCase().trim();

		// Fragen nach Domain filtern
		const questions = report.questions;
		const filteredQuestions = questions.filter(
			q => normalize(q.domain) === normalize(selectedDomain)
		);

		// FALL 1: Keine Fragen gefunden -> "Keine Daten vorhanden!" anzeigen
		if (filteredQuestions.length === 0) {
			return {
				title: {
					text: selectedDomain,
					left: 'center'
				},
				graphic: {
					type: 'text',
					left: 'center',
					top: 'middle',
					style: {
						text: 'Keine Daten vorhanden!',
						fill: '#9CA3AF',
						fontSize: 15,
						fontWeight: 'bold'
					}
				}
			};
		}

		// FALL 2: Fragen vorhanden -> Auswertung berechnen & Pie-Chart rendern
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
				incorrectCount++;
			}
		});

		return {
			title: {
				text: selectedDomain,
				left: 'center'
			},
			tooltip: {
				trigger: 'item'
			},
			legend: {
				orient: 'horizontal',
				left: 'left',
				bottom: 'bottom'
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
		await storeValue("explanationQuestionID", currentData.id);
										 

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

		console.log("question id:", String(question._id));

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
		
		// --- ROBUSTE DATUMS-ERKENNUNG & BERLINER ZEITZONE ---
		let targetDate = new Date();
		
		if (report.finished) {
			if (typeof report.finished === 'string' && report.finished.includes('.')) {
				// Falls das Format z.B. "23.10.2026 15:55" ist
				const [datePart, timePart = "00:00"] = report.finished.split(" ");
				const [day, month, year] = datePart.split(".");
				const [hour, minute] = timePart.split(":");
				targetDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:00.000Z`);
			} else {
				// Standard ISO-String oder bereits ein Datum
				targetDate = new Date(report.finished);
			}
		}
		
		// Fallback, falls das Parsen fehlschlägt
		if (isNaN(targetDate.getTime())) {
			targetDate = new Date();
		}
		
        const berlinFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Europe/Berlin',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        
        const parts = berlinFormatter.formatToParts(targetDate);
        const getPart = (type) => parts.find(p => p.type === type).value;
        
        const year = getPart('year');
        const month = getPart('month');
        const day = getPart('day');
        const hour = getPart('hour');
        const minute = getPart('minute');
        const second = getPart('second');
        
        const finishedDateLocal = `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
		// ------------------------------------------------
		
		const reportToSave = {
			...reportMetadata,
			// MongoDB Extended JSON für echtes ISODate mit Berliner Ortszeit
			finished: { "$date": finishedDateLocal },
			questions: questions.map(({ userAnswer, isCorect, _id, isCorrect }) => ({
				userAnswer,
				isCorrect: isCorrect !== undefined ? isCorrect : isCorect,
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

	updateWrongQuestionCount: async (questions) => {
    const falseAnswers = {};

    try {
        // 1. Nur falsche Fragen filtern und nach Collection gruppieren
        questions
            .filter(q => q.isCorrect === false)
            .forEach(q => {
                const collectionName = q.origin ? q.origin : 'question';
                
                // Falls für diese Collection noch kein Array existiert, erstelle eins
                if (!falseAnswers[collectionName]) {
                    falseAnswers[collectionName] = [];
                }
                
                // ID zum Array der jeweiligen Collection hinzufügen
                falseAnswers[collectionName].push(q._id);
            });

        // 2. Für jede Collection die Query ausführen
        for (const [collection, idsArray] of Object.entries(falseAnswers)) {
            await UpdateFalseRateQuestions.run({
                collection: collection,
                ids: idsArray // Jetzt ist es ein echtes Array von IDs!
            });
        }
    } catch (error) {
        console.error("Fehler beim Aktualisieren der falschen Fragen:", error);
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
		await storeValue('currentIndex', 0, false);

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

	sendMessage: async (userMessage) => {
		if (!userMessage || userMessage.trim() === "") return;

		// Prüfen, ob der aktive Chat-Key im Store existiert.
		if (!appsmith.store.gemini_chat_key) {
			await storeValue("gemini_chat_key", appsmith.store.gemini_key_free);
		}
		
		// Chat initialisieren, wenn ein neues Thema angefangen wurde
		const explanationQuestionID = appsmith.store.explanationQuestionID
	  	const KIChatQuestionId = appsmith.store.KIChatQuestionId;
		if (!KIChatQuestionId || explanationQuestionID !== KIChatQuestionId) {
			showAlert("Chat will be initilized!"+JSON.stringify(explanationQuestionID)+JSON.stringify(KIChatQuestionId))
			await this.initChat();
			storeValue("KIChatQuestionId", explanationQuestionID, false);
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

	handleTabChange: async () => {
		showAlert("Auswertung gestartet");

		// Gibt den Namen/Label des aktivierten Tabs als String zurück (z. B. "Tab 1" oder "Settings")
		const currentTab = Tabs1.selectedTab;

		showAlert(currentTab);
		if (currentTab === "Gemini Auswertung") {
			await this.evaluateTest();
		}
	},
	/**
	 * Hilfsfunktion: Bettet die JSON-Ergebnisse von Gemini in dein HTML-Template ein
	 */
	buildHtmlReport: function(data) {
		const isPassed = data.examStatus === "PASSED";
		const badgeColor = isPassed ? "#2F855A" : "#C53030";
		const badgeBg = isPassed ? "#C6F6D5" : "#FED7D7";
		const badgeText = isPassed ? "PASSED (PROBABLE)" : "NEEDS IMPROVEMENT";

		// Unterstützung sowohl für separate HTML-Felder als auch für ein einzelnes reportMarkdown/reportHtml Feld
		const scoreAnalysis = data.scoreAnalysisHtml || "";
		//const thematicAnalysis = data.thematicAnalysisHtml || "";
		//const revisionPlan = data.revisionPlanHtml || "";

		let section = {
			header: 'Häufige Fehlermuster &amp; ISACA Mindset-Abweichungen',
			description: 'Aus der Auswertung Ihrer falsch beantworteten Fragen lassen sich folgende zentrale Denkmuster und Unsicherheiten identifizieren:',
			items: data.thematicAnalysis
		}

		const thematicAnalysis = this.generateCompleteHtml(section);

		section = {
			header: 'Priorisierter Lernplan',
			description: 'Fokussieren Sie Ihre finale Wiederholung auf folgende Kernbereiche, um Ihr Ergebnis weiter abzusichern:',
			items: data.revisionPlan
		}

		const revisionPlan = this.generateCompleteHtml(section);

		//const thematicAnalysis = `<h4>Analyse der Fehlerschwerpunkte!!!!!!!!</h4><p>Aus der Auswertung Ihrer falsch beantworteten Fragen lassen sich folgende zentrale Denkmuster und Unsicherheiten identifizieren:</p><ul>${data.thematicAnalysis.map(item => `<li>${item}</li>`).join('')}</ul>`;	
		//const revisionPlan = `<h4>Priorisierter Revisionsplan</h4><p>Fokussieren Sie Ihre finale Wiederholung auf folgende Kernbereiche, um Ihr Ergebnis weiter abzusichern:</p><ul>${data.revisionPlan.map(item => `<li>${item}</li>`).join('')}</ul>`;


		// Fallback, falls Gemini alles in ein einziges Feld geschrieben hat
		const singleReport = data.reportMarkdown || data.reportHtml || "";

		return `
			<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #2D3748; max-width: 900px; margin: 0 auto; line-height: 1.6;">
				<style>
					.report-card { background: #FFFFFF; border-radius: 10px; border: 1px solid #E2E8F0; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
					.metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 15px; }
					.metric-box { background: #F7FAFC; padding: 15px; border-radius: 8px; text-align: center; border: 1px solid #EDF2F7; }
					.metric-val { font-size: 1.6rem; font-weight: 700; color: #1A202C; }
					.metric-lbl { font-size: 0.8rem; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; }
					.badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-weight: 700; font-size: 0.85rem; }
					.cism-content h3 { color: #2B6CB0; margin-top: 0; border-bottom: 2px solid #E2E8F0; padding-bottom: 8px; font-size: 1.15rem; }
					.cism-content h4 { color: #2C5282; margin: 14px 0 6px 0; font-size: 1.05rem; }
					.cism-content ul { padding-left: 20px; margin-top: 8px; margin-bottom: 12px; }
					.cism-content li { margin-bottom: 6px; }
					.cism-content p { margin-bottom: 10px; }
					.cism-content strong { color: #1A202C; }
					.cism-content hr { border: 0; height: 1px; background: #E2E8F0; margin: 20px 0; }
				</style>

				<!-- HEADER & KEY METRICS -->
				<div class="report-card">
					<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
						<h3 style="margin: 0; border: none; color: #1A365D; font-size: 1.25rem;">CISM Performance Evaluation</h3>
						<span class="badge" style="background-color: ${badgeBg}; color: ${badgeColor};">${badgeText}</span>
					</div>

					<div class="metric-grid">
						<div class="metric-box">
							<div class="metric-val">${data.weightedScore ?? 0}%</div>
							<div class="metric-lbl">Gewichtete Trefferquote</div>
						</div>
						<div class="metric-box">
							<div class="metric-val" style="color: #2B6CB0;">
								${data.projectedIsacaScoreMin ?? '-'} - ${data.projectedIsacaScoreMax ?? '-'}
							</div>
							<div class="metric-lbl">Prognose ISACA-Score</div>
						</div>
						<div class="metric-box">
							<div class="metric-val">450</div>
							<div class="metric-lbl">Bestehensgrenze</div>
						</div>
					</div>

					${scoreAnalysis ? `<div class="cism-content" style="margin-top: 20px;">${scoreAnalysis}</div>` : ''}
				</div>

				${singleReport ? `
					<!-- EINZELNER BERICHT (FALLBACK) -->
					<div class="report-card cism-content">
						${singleReport}
					</div>
				` : `
					<!-- SCHWERPUNKTE & FEHLERANALYSE -->
					${thematicAnalysis ? `
						<div class="report-card cism-content">
							<h3>Inhaltliche Schwerpunkt- & Fehleranalyse</h3>
							${thematicAnalysis}
						</div>
					` : ''}

					<!-- LERN- & REVISIONSPLAN -->
					${revisionPlan ? `
						<div class="report-card cism-content">
							<h3>Priorisierter Lern- & Revisionsplan</h3>
							${revisionPlan}
						</div>
					` : ''}
				`}
			</div>
		`;
	},

	evaluateTest: async function() {
		showAlert("Evaluation Test with Gemini!", "info");

		const geminiOpinion = appsmith.store.report.geminiEvaluation;

		if (geminiOpinion) {
			console.log("Gemini opinion: ",geminiOpinion);
			return;
		}

		const report = appsmith.store.report;

		const qIds = report.questions.map(q => {
			return q._id;
		});

		// TODO: Review
		const questionsResult = await GetQuestionsForTest.run({qIds: qIds});

		const questions = questionsResult.reduce((acc, item) => {
			const idStr = typeof item._id === 'object' ? item._id.$oid : item._id.toString();
			acc[idStr] = item;
			return acc;
		}, {});

		const domainResult = {};
		const wrongQuestions = [];

		report.questions.map(q => {
			const _id = q._id;
			questions[_id].userAnswer = q.userAnswer;

			const domain = questions[_id].domain;

			if (!domainResult[domain]) {
				domainResult[domain] = {
					correctCount: 0,
					falseCount: 0 
				};
			}

			if (q.isCorrect) {
				domainResult[domain].correctCount += 1;
			} else {
				domainResult[domain].falseCount += 1;
				const wrongQuestion = {
					"Questions-ID": questions[_id].ID,
					Domain: questions[_id].domain,
					Frage: questions[_id].question
				};

				let userAnswer = "";
				let correctAnswer = "";
				questions[_id].answers.map(a => {
					if (a.type === questions[_id].correct) {
						correctAnswer = a.text;
					} else if (a.type === q.userAnswer) {
						userAnswer = a.text;
					}
				});

				wrongQuestion["Meine Antwort"] = userAnswer;
				wrongQuestion["Richtige Antwort"] = correctAnswer;

				wrongQuestions.push(wrongQuestion);
			}
		});

		const prompt = this.buildPrompt(domainResult, wrongQuestions);
		const geminiEvaluation = await GeminiAPITestEvaluation.run({systemContext: prompt});
		const responseText = geminiEvaluation?.candidates?.[0]?.content?.parts?.[0]?.text;

		if (responseText) {
			let finalHtml = "";

			try {
				// Da Gemini ein JSON-Objekt zurückliefert, parsen wir es hier direkt
				console.log("------------------------------------------------------------------------------------------------------------------");
				const parsedJson = JSON.parse(responseText);

				const thematicAnalysis = this.parseHtmlToList(parsedJson.thematicAnalysisHtml);
				const revisionPlan = this.parseHtmlToList(parsedJson.revisionPlanHtml);
				console.log("Parsed JSON: ", parsedJson);

				delete parsedJson.thematicAnalysisHtml;
				delete parsedJson.revisionPlanHtml;

				parsedJson.thematicAnalysis = thematicAnalysis;
				parsedJson.revisionPlan = revisionPlan;
				console.log("Parsed JSON: ", parsedJson);


				const report = appsmith.store.report;
				const updatedReport = {
					...report,
					geminiEvaluation: parsedJson
				}
				await storeValue("report", updatedReport);

				console.log("report in store ", appsmith.store.report);

				//const raw = parsedJson. scoreAnalysisHtml + parsedJson.revisionPlanHtml + parsedJson.scoreAnalysisHtml;

				// Wir übergeben das geparste JSON-Objekt an unser HTML-Template
				finalHtml = this.buildHtmlReport(parsedJson);

				console.log(finalHtml);
				console.log("------------------------------------------------------------------------------------------------------------------");


				/*
				await SaveEvaluation.run({ 
					evaluationData: finalHtml 
					});
				*/

			} catch (e) {
				console.error("Fehler beim Parsen der Gemini-Antwort:", e);
				// Fallback, falls die API unerwartet reinen Text statt JSON lieferte
				finalHtml = `<div style="padding: 20px; font-family: sans-serif;">${responseText.replace(/\n/g, '<br>')}</div>`;
			}

			console.log(finalHtml);

			// Das finale, gestaltete HTML im Store ablegen
			await storeValue('geminiEvaluationResult', finalHtml);
		}
	},


	parseHtmlToList: (htmlString) => {
		if (!htmlString) return [];
		
		const regex = /<li>\s*<strong>(.*?)<\/strong>(.*?)<\/li>/gs;
		const result = [];
		let match;

		while ((match = regex.exec(htmlString)) !== null) {
		const tag = match[1].replace(/<[^>]*>/g, '').trim();
		const review = match[2].replace(/<[^>]*>/g, '').trim();
		
		result.push({ tag, review });
		}

		return result;
	},

	generateCompleteHtml: (data) => {
		// Prüfen, ob Daten und Items vorhanden sind
		if (!data || !data.items || !Array.isArray(data.items) || data.items.length === 0) return '';
		
		// 1. Listenelemente generieren
		const listItems = data.items.map(item => {
			return `  <li><strong>${item.tag}</strong> ${item.review}</li>`;
			}).join('\n');
		
		// 2. HTML-Bausteine zusammensetzen
		let html = '';
		
		if (data.header) {
		html += `<h4>${data.header}</h4>\n`;
		}
		
		if (data.description) {
		html += `<p>${data.description}</p>\n`;
		}
		
		html += `<ul>\n${listItems}\n</ul>`;
		
		return html;
	},
	

	/**
	 * Hilfsfunktion: Fügt vor Markdown-Steuerzeichen echte Zeilenumbrüche ein,
	 * falls der String als ein zusammenhängender Block geliefert wird.
	 */
	fixMarkdownFormatting: function(rawMarkdown) {
		if (!rawMarkdown) return "";

		// Zuerst maskierte Umbrüche (\n) in echte Umbrüche umwandeln
		let str = rawMarkdown.replace(/\\n/g, '\n');

		// Falls Überschriften oder Listenpunkte ohne Umbruch aneinanderkleben:
		str = str
			.replace(/\s+(#+\s+)/g, '\n\n$1')          // Umbrüche vor Überschriften (#, ##, ###, ####)
			.replace(/\s+(-\s+\*\*)/g, '\n- **')       // Umbrüche vor Fett-Listenpunkten (- **)
			.replace(/\s+(-\s+)/g, '\n- ')             // Umbrüche vor normalen Listenpunkten (- )
			.replace(/\s+(\d+\.\s+\*\*)/g, '\n\n$1')    // Umbrüche vor nummerierten Listen (1. **, 2. **)
			.replace(/\s+(---)/g, '\n\n$1')            // Umbrüche vor Trennlinien (---)
			.trim();

		return str;
	},

	// Hauptfunktion zum Befüllen des Templates
	buildPrompt(domainResults, wrongQuestions = []) {

		const rawTemplate = `Du bist ein erfahrener ISACA CISM Exam Tutor und Datenanalyst. Ich übergebe Dir hiermit die Ergebnisse meines CISM-Prüfungstests zur Auswertung und Schwerpunktanalyse.

### 1. ERGEBNISSE NACH DOMAINS
- Domain 1 (Information Security Governance): {{D1_RIGHT}} richtig / {{D1_WRONG}} falsch (Gesamt: {{D1_TOTAL}})
- Domain 2 (Information Security Risk Management): {{D2_RIGHT}} richtig / {{D2_WRONG}} falsch (Gesamt: {{D2_TOTAL}})
- Domain 3 (Information Security Program Development & Management): {{D3_RIGHT}} richtig / {{D3_WRONG}} falsch (Gesamt: {{D3_TOTAL}})
- Domain 4 (Information Security Incident Management): {{D4_RIGHT}} richtig / {{D4_WRONG}} falsch (Gesamt: {{D4_TOTAL}})

### 2. LISTE DER FALSCH BEANTWORTETEN FRAGEN
{{EACH_WRONG_QUESTION}}

---

### AUFGABE & OUTPUT-FORMAT

Antworte AUSSCHLIESSLICH mit einem gültigen JSON-Objekt ohne Codeblocks/Markdown.

Nutze für alle Textfelder (Abschnitt 2 und 3) sauberes, kompaktes HTML (NUR <p>, <ul>, <li>, <strong>, <h4>). Verwende KEIN Markdown (#, *, -) inside the text!

Struktur des geforderten JSON-Objekts:
{
  "weightedScore": number,                  // Berechnete gewichtete Trefferquote in % (z.B. 68.5)
  "projectedIsacaScoreMin": number,         // Geschätzter minimaler ISACA-Score (200-800)
  "projectedIsacaScoreMax": number,         // Geschätzter maximaler ISACA-Score (200-800)
  "examStatus": "PASSED" | "FAILED",        // Status basierend auf 450 Punkten Grenze
  "scoreAnalysisHtml": "HTML-String",        // Kurzer Erläuterungstext zu den Scores (Abschnitt 1)
  "thematicAnalysisHtml": "HTML-String",     // Gruppierung der Fehler & Denkfehler (Abschnitt 2)
  "revisionPlanHtml": "HTML-String"          // Priorisierter Lernplan (Abschnitt 3)
}`;


		// 1. Extrahiere die Statistiken für D1 bis D4 mit Lodash
		const d1 = this.getDomainStats(domainResults, "Domain 1");
		const d2 = this.getDomainStats(domainResults, "Domain 2");
		const d3 = this.getDomainStats(domainResults, "Domain 3");
		const d4 = this.getDomainStats(domainResults, "Domain 4");

		// 2. Falsche Fragen als formatierte Liste aufbereiten
		const wrongQuestionsText = _.isEmpty(wrongQuestions)
		? "Keine falschen Fragen vorhanden."
		: _.map(wrongQuestions, (q) => {
			return `- Question-ID: ${q["Questions-ID"]}
  Domain: ${q.Domain}
  Frage: ${q.Frage}
  Meine Antwort: ${q["Meine Antwort"]}
  Richtige Antwort: ${q["Richtige Antwort"]}`;
		}).join('\n\n');

		// 3. Flaches Objekt mit allen Platzhaltern erstellen
		const templateContext = {
			D1_RIGHT: d1.RIGHT, D1_WRONG: d1.WRONG, D1_TOTAL: d1.TOTAL,
			D2_RIGHT: d2.RIGHT, D2_WRONG: d2.WRONG, D2_TOTAL: d2.TOTAL,
			D3_RIGHT: d3.RIGHT, D3_WRONG: d3.WRONG, D3_TOTAL: d3.TOTAL,
			D4_RIGHT: d4.RIGHT, D4_WRONG: d4.WRONG, D4_TOTAL: d4.TOTAL,
			EACH_WRONG_QUESTION: wrongQuestionsText
		};

		// 4. Template-Engine konfigurieren (Interpolation für {{ Platzhalter }})
		const compiled = _.template(rawTemplate, {
			interpolate: /\{\{([\s\S]+?)\}\}/g
		});

		return compiled(templateContext);
	},

	// Hilfsfunktion: Sucht die Domain-Daten im geschachtelten Objekt
	getDomainStats(domainResults, domainPrefix) {
		// Findet den passenden Schlüssel (z. B. den mit "Domain 1" beginnt)
		const key = _.find(_.keys(domainResults), (k) => k.startsWith(domainPrefix));
		const data = domainResults[key] || { correctCount: 0, falseCount: 0 };

		const right = data.correctCount || 0;
		const wrong = data.falseCount || 0;

		return {
			RIGHT: right,
			WRONG: wrong,
			TOTAL: right + wrong
		};
	},

	resetBookmarksForReport: async() => {

		const report = appsmith.store.report;
		const questions = report.questions;
		let ids = [];

		const newQuestions = questions.map(question => {
			if (question.isBookmarked) {
				question.isBookmarked = false;
				question.hasBookmark = false;
				ids.push(question._id.toString());
			}
			return question;
		});

		if (ids.length > 0){
			report.questions = newQuestions;
			//old_DeleteManyBookmarks.run({ questionIds: ids });
		}
		
		showAlert("Alle Bookmarks in diesem Report wurden zurückgesetzt!!!", "info");
	}
}
