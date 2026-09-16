export default {
	  // Speichert den aktuellen Status der Checkboxen
  selectedOptions: [],
	
	init: async() => {
		await this.loadAndSaveConfiguration();
		await this.startTimer();
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
	
  toggleQuestionBookmark: async (val) => {
    const bookmark = appsmith.store.bookmark;

    if (bookmark === val) {
      // Wenn es schon gespeichert ist, lösche es wieder
      await removeValue('bookmark');
    } else {
      // Ansonsten speichere das neue Bookmark
      await storeValue('bookmark', val);
    }
  },

	processInput: async (text) => {
			if (!text) return;

			const command = text.toLowerCase().trim();

			// 1. Aktuelle Fragen-Daten aus dem Store holen
			const questions = appsmith.store.currentQuestions || [];
			const currentIndex = appsmith.store.currentIndex || 0;

			if (!questions[currentIndex]) {
				showAlert("Keine aktive Frage gefunden!", "error");
				await resetWidget("Input1", true);
				return;
			}

			let newAnswer = [];

			// 2. Sprachbefehl für Checkbox-Auswahl auswerten (Single-Select)
			if (command.includes("option a") || command.includes("wahl a") || command.includes(" a ")) {
				newAnswer = ["A"];
			} else if (command.includes("option b") || command.includes("wahl b") || command.includes(" b ")) {
				newAnswer = ["B"];
			} else if (command.includes("option c") || command.includes("wahl c") || command.includes(" c ")) {
				newAnswer = ["C"];
			} else if (command.includes("option d") || command.includes("wahl d") || command.includes(" d ")) {
				newAnswer = ["D"];
			} else if (command.includes("löschen") || command.includes("zurücksetzen")) {
				newAnswer = [];
			}

			// 3. Antwort im Fragen-Array aktualisieren
			questions[currentIndex].userAnswer = newAnswer;

			// 4. Den Appsmith Store aktualisieren (löst sofortiges UI-Update aus)
			await storeValue("currentQuestions", questions);

			// 5. BUTTON-STEUERUNG (Aktion ausführen)
			if (command.includes("speichern") || command.includes("absenden") || command.includes("weiter") || command.includes("button klicken")) {
				await this.executeButtonAction();
			}

			// 6. Input-Feld leeren
			await resetWidget("Input1", true);
		},
	
// Die Funktion für Ihren Button
  executeButtonAction: async () => {
    const questions = appsmith.store.currentQuestions || [];
    const currentIndex = appsmith.store.currentIndex || 0;
    const currentAnswer = questions[currentIndex]?.userAnswer || [];

    if (currentAnswer.length === 0) {
      showAlert("Bitte wählen Sie zuerst eine Antwort aus!", "warning");
      return;
    }

    // Hier Ihre bestehende Button-Logik aufrufen (z. B. nächste Frage oder Speichern)
    showAlert(`Antwort '${currentAnswer[0]}' gespeichert!`, "success");
    
    // Beispiel: Zur nächsten Frage springen
    // await storeValue("currentIndex", currentIndex + 1);
  },
	
  saveUserAnswer: async (selectedValues) => {
    const currentIndex = appsmith.store.currentIndex;
    const questions = [...appsmith.store.currentQuestions];

    const singleValue = selectedValues.length > 0
      ? selectedValues[selectedValues.length - 1].trim()
      : null;

    const rightAnswer = questions[currentIndex].correct.trim();
    const isCorrect = rightAnswer === singleValue;

    console.log(singleValue);

    // 1. Speichern
    questions[currentIndex].userAnswer = singleValue;
    questions[currentIndex].isCorrect = isCorrect;

    console.log("Value: ", rightAnswer, singleValue, isCorrect);

    await storeValue("currentQuestions", questions);
  },

  goTo: async (page) => {
    navigateTo(page, {}, 'SAME_WINDOW');
  },
	
	proceedWithGeminExplanation: async() => {
		const geminiExplain = appsmith.store.geminiExplain;
		const moveToPage = appsmith.store.moveToPage;
		if (!moveToPage && geminiExplain !== undefined && geminiExplain !== null && geminiExplain === true) {
      await this.processGeminiExplain();
			await storeValue("moveToPage", true, false);
    } else {
			await removeValue("moveToPage");
			if(geminiExplain !== undefined || geminiExplain !== null || geminiExplain === false) {
				await storeValue("moveToPage", true, false);
			}
			this.proceed("Evaluation");
		}
	},
	
  proceed: async (page) => {
		
		resetWidget("RichTextEditor1");
		
    // 1. Speichere zuerst die Metadaten (Kommentar/Bookmark) der AKTUELLEN Frage
    await this.saveQuestionMeta();

    const currentIndex = appsmith.store.currentIndex;
    const questions = [...appsmith.store.currentQuestions];
				
    // 2. Prüfen, ob noch weitere Fragen im Array vorhanden sind
    if (currentIndex < questions.length - 1) {
      const nextIndex = currentIndex + 1; // Der Index der NÄCHSTEN Frage
      const nextQuestionId = questions[nextIndex]._id;

      // Nächste Frage einblenden (Index erhöhen)
      await storeValue("currentIndex", nextIndex);

      // Bereits gespeicherte Antwort für die nächste Frage laden
      const nextAnswer = questions[nextIndex].userAnswer || [];
      await storeValue("selectedAnswers", nextAnswer);

      // Frisch geladene Kommentare holen
      await Tags.run();

      // WICHTIG: Nach der NÄCHSTEN Frage suchen (nextQuestionId oder nextIndex)
      const existingTags = Tags.data?.find(b => b.questionId === nextQuestionId);

      if (Array.isArray(existingTags)) {
        console.log("Setze tags: ", existingTags);
        await storeValue("tagsList", existingTags);
      } else {
        console.log("Lösche tags");
        await storeValue("tagsList", []);
      }

    } else {

      const questionIds = questions.map(q => q._id);
      await storeValue('questionIds', questionIds, false);

      this.getResults();
      this.goTo(page);
    }
  },
  saveQuestionMeta: async () => {
    const currentIndex = appsmith.store.currentIndex;
    const questions = [...appsmith.store.currentQuestions];
    const currentQuestionId = questions[currentIndex]._id;
    
    // === BOOKMARKS ===
    await Bookmarks.run();
    const bookmark = appsmith.store.bookmark;
    const existingBookmark = Bookmarks.data?.find(b => b.questionId === currentQuestionId);

    if (bookmark) {
      questions[currentIndex].bookmark = bookmark;
      if (!existingBookmark) {
        console.log("Insert bookmark for question: ", currentQuestionId);
        await InsertBookmark.run({qId: currentQuestionId});
      }
    } else {
      questions[currentIndex].bookmark = false;
      if (existingBookmark) {
        console.log("Delete bookmark for question: ", currentQuestionId);
        await DeleteBookmark.run({qId: currentQuestionId});
      }
    }

    await removeValue('bookmark');
    await resetWidget("Checkbox1", false);


    await Tags.run();
    const tags = tagsInput.model.tags;
    const existingTags = Tags.data?.find(b => b.questionId === currentQuestionId);

    console.log(tags);

    if (Array.isArray(tags) && tags.length > 0) {
      questions[currentIndex].tags = tags;

      if (!existingTags) {
        console.log("Insert tags for question: ", currentQuestionId);
        await InsertTags.run({
          qId: currentQuestionId,
          tags: tags
        });
      } else {
        console.log("Updating tags for questioni: ", currentQuestionId);
        await UpdateTags.run({
          qId: currentQuestionId, // z.B. Table1.selectedRow._id oder eine Variable
          tags: tags           // Das Array aus dem Custom Widget
        });
      }
    } else {
      delete questions[currentIndex].tags;
      if (existingTags) {
        console.log("Delete tags for question: ", currentQuestionId);
        await DeleteTags.run({qId: currentQuestionId});
      }
    }
  },

  startTimer: async () => {
    // Falls bereits ein Timer läuft, diesen stoppen
    if (appsmith.store.timerInterval) {
      clearInterval(appsmith.store.timerInterval);
    }

    // Minuten aus dem Store holen (Standardwert 5, falls leer oder ungültig)
    const totalMinutes = Number(appsmith.store.mins) || 5;
    const totalSeconds = totalMinutes * 60;

    // Initialisiere die Restzeit in Sekunden
    await storeValue("timeLeft", totalSeconds);

    const intervalId = setInterval(async () => {
      const currentTime = appsmith.store.timeLeft;

      if (currentTime > 0) {
        await storeValue("timeLeft", currentTime - 1);
      } else {
        // Zeit abgelaufen!
        clearInterval(appsmith.store.timerInterval);
        await storeValue("timerInterval", null);

        const page = "Evaluation";

        this.getResults();
        this.goTo(page);

        // Optional: Automatisch zur Auswertung navigieren
        navigateTo('Evaluation', {}, 'SAME_WINDOW');
      }
    }, 1000); // Jede Sekunde (-1 Sekunde)

    // Interval-ID im Store speichern
    await storeValue("timerInterval", intervalId);
  },

// Timer anhalten und Restzeit im Store behalten
  pauseTimer: async () => {
    if (appsmith.store.timerInterval) {
      clearInterval(appsmith.store.timerInterval);
      await storeValue("timerInterval", null);
    }
  },

  // Timer an exakt derselben Stelle fortsetzen
  resumeTimer: async () => {
    // Verhindern, dass mehrere Intervalle gleichzeitig laufen
    if (appsmith.store.timerInterval) return;

    const currentTime = appsmith.store.timeLeft;

    // Wenn keine Zeit mehr da ist, nicht starten
    if (currentTime === undefined || currentTime <= 0) return;

    const intervalId = setInterval(async () => {
      const current = appsmith.store.timeLeft;

      if (current > 0) {
        await storeValue("timeLeft", current - 1);
      } else {
        // Zeit abgelaufen!
        clearInterval(appsmith.store.timerInterval);
        await storeValue("timerInterval", null);

        this.getResults();
        this.goTo('Evaluation'); // Seite entsprechend anpassen falls nötig
      }
    }, 1000);

    await storeValue("timerInterval", intervalId);
  },

  // Schalter-Logik: Entscheidet ob Pause oder Weiterlaufen
  toggleTimer: async (isSwitchedOn) => {
    if (isSwitchedOn) {
      await this.resumeTimer();
    } else {
      await this.pauseTimer();
    }
  },

  formatTime: (seconds) => {
    if (seconds === undefined || seconds === null) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  },

  getResults: async () => {
    const questions = appsmith.store.currentQuestions || [];

    console.log(questions);

    // 1. Zähle die korrekten Antworten (Feld 'correct' ist true)
    const correctCount = questions.filter(q => q.isCorrect === true).length;

    // 2. Zähle den Rest (Feld 'correct' ist false ODER existiert nicht)
    const incorrectCount = questions.filter(q => q.isCorrect !== true).length;

    const questioncount = appsmith.store.nrquestions;
    const minutes = appsmith.store.mins;

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
  },

  processGeminiExplain: async() => {

		showAlert("Evaluierung mit Gemini!!");
		
		const timerOn = Switch1.isSwitchedOn;

		if (timerOn) {
    	await this.toggleTimer(false);
		}
		
		const currentIndex = appsmith.store.currentIndex;
    const questions = [...appsmith.store.currentQuestions];
		const question = questions[currentIndex];
		
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
		question.gemintExplanation = evaluationText;
		
		if (timerOn) {
    	await this.toggleTimer(true);
		}
		
		return question;
  },
	
	toggleGeminiExplanation: async(switchedOn) => {
		if (switchedOn) {
			await storeValue("geminiExplain", Switch1.isSwitchedOn, false);
			await removeValue("moveToPage");
		} else {
			await removeValue("geminiExplain");
			await storeValue("moveToPage", "Evaluation", false);
		}
	}
}