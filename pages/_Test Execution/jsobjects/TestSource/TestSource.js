export default {
    // Speichert den aktuellen Status der Checkboxen
    selectedOptions: [],

    init: async () => {
        await this.loadAndSaveConfiguration();
        const currentIndex = appsmith.store.currentIndex;

        const questions = appsmith.store.currentQuestions;
        const question = questions[currentIndex];

        const progStep = currentIndex + 1;
        this.updateProgress(progStep, questions.length);

        this.shuffleAnswers(question.answers);

        const testBackup = appsmith.store.testBackup;
        if (typeof testBackup !== "undefined") {
            const timeLeft = appsmith.store.testBackup.timeLeft;
            console.log(timeLeft);
            await storeValue("timeLeft", timeLeft, false);
            const timerInterval = appsmith.store.testBackup.timerInterval;
            await storeValue("timerInterval", timerInterval, false);
            console.log(timerInterval);
            const testProgress = appsmith.store.testBackup.testProgress;
            await storeValue("testProgress", testProgress, false);
            console.log(testProgress);
            //showAlert("Test backup set!!!");

            const cuIndex = appsmith.store.testBackup.currentIndex;
            await storeValue("currentIndex", cuIndex, false);
            //showAlert("Curent index: " + JSON.stringify(appsmith.store.currentIndex));
        }

        Helper.testUnique();

        await this.startTimer();
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
                    //showAlert("Configuration - saving '" + item.name + "'", "success");
                    await storeValue(item.name, item.value);
                }
            }

            //showAlert("Konfiguration erfolgreich in den Store geladen!", "success");
        } catch (error) {
            //showAlert("Fehler beim Laden der Konfiguration: " + error.message, "error");
        }
    },

    updateProgress: async (current, total) => {
        const progress = Math.round((current / total) * 100);
        //showAlert("Current progress " + JSON.stringify(progress), "info");
        await storeValue("testProgress", progress);
    },

    shuffleAnswers: async (answers) => {
        const sortedAnswers = answers.sort(() => Math.random() - 0.5);
        const chars = ["A", "B", "C", "D"];
        sortedAnswers.forEach(async (answer, idx) => {
            const label = "answer" + chars[idx];
            await storeValue(label, answer.text, false);
            await storeValue(label + "_value", answer.type, false);
        });
    },

    nextQuestion: async () => {
        const currentIndex = appsmith.store.currentIndex;
        const questions = [...appsmith.store.currentQuestions];
        const progStep = currentIndex + 1;

        const answerFields = ["answerA", "answerB", "answerC", "answerD"];
        answerFields.forEach((field) => {
            removeValue(field);
            removeValue(field + "_value");
            resetWidget(field, false);
        });

        this.updateProgress(progStep, questions.length);

        // 2. Prüfen, ob noch weitere Fragen im Array vorhanden sind
        if (currentIndex < questions.length - 1) {
            const nextIndex = currentIndex + 1; // Der Index der NÄCHSTEN Frage

            //await this.findQuestionBookmark();

            const answers = questions[nextIndex].answers;
            this.shuffleAnswers(answers);

            removeValue("goToNextQuestion");

            await storeValue("currentIndex", nextIndex);
        } else {
            const questionIds = questions.map((q) => q._id);
            await storeValue("questionIds", questionIds, false);

            this.getResults();
            navigateTo("Evaluation", {}, "SAME_WINDOW");
        }
    },

    saveUserAnswer: async (selected) => {
        const answerFields = ["answerA", "answerB", "answerC", "answerD"];
        const userAnswer = appsmith.store[selected.widgetName + "_value"];
        answerFields.forEach((field) => {
            if (field !== selected.widgetName.trim()) {
                resetWidget(field, false);
            }
        });

        const currentIndex = appsmith.store.currentIndex;
        const questions = [...appsmith.store.currentQuestions];

        const rightAnswer = questions[currentIndex].correct;
        const isCorrect = rightAnswer.trim() === userAnswer.trim();

        console.log("Types:", typeof rightAnswer, typeof userAnswer);
        console.log("JSON:", JSON.stringify(rightAnswer), JSON.stringify(userAnswer));

        questions[currentIndex].userAnswer = userAnswer;
        questions[currentIndex].isCorrect = isCorrect;

        if (userAnswer && userAnswer.trim() !== "") {
            await storeValue("goToNextQuestion", true, false);
        }

        await storeValue("currentQuestions", questions);
    },

    /*
     * Saves the bookmark for the current qustion bevor moving to the next question
     */
    saveOrDeleteQuestionBookmark: async () => {
        const bookmark = Bookmark.isChecked;
        const questions = appsmith.store.currentQuestions;
        const idx = appsmith.store.currentIndex;
        const currentQuestion = questions[idx];

        if (!currentQuestion.hasBookmark && bookmark) {
            console.log("Adding bookmark for question: ", currentQuestion._id);
            await InsertBookmark.run({
                id: currentQuestion._id.toString(),
            });
        } else if (currentQuestion.hasBookmark && !bookmark) {
            console.log("Removing bookmark for question: ", currentQuestion._id);
            await DeleteBookmark.run({
                id: currentQuestion._id.toString(),
            });
        } else {
            return;
        }

        // 2. Array kopieren und das betroffene Question-Objekt aktualisieren
        const updatedQuestions = [...questions];
        updatedQuestions[idx] = {
            ...currentQuestion,
            hasBookmark: bookmark, // Setzt hasBookmark auf den neuen Zustand (true/false)
        };

        console.log("Bookmark modified questions: ", updatedQuestions);

        // 3. Im Appsmith-Store dauerhaft speichern (aktualisiert automatisch UI-Widgets)
        await storeValue("currentQuestions", updatedQuestions, false);
    },

    getResults: async () => {
        Helper.testUnique();

        const questions = appsmith.store.currentQuestions || [];

        console.log(questions);

        // 1. Zähle die korrekten Antworten (Feld 'correct' ist true)
        const correctCount = questions.filter((q) => q.isCorrect === true).length;

        // 2. Zähle den Rest (Feld 'correct' ist false ODER existiert nicht)
        const incorrectCount = questions.filter((q) => q.isCorrect !== true).length;

        const questioncount = appsmith.store.nrquestions;
        const minutes = appsmith.store.mins;

        const report = {
            questions: questions,
            correct: correctCount,
            incorrect: incorrectCount,
            name: appsmith.store.title,
            test_executed_by: appsmith.store.user,
            finsihed: moment().format("DD.MM.YYYY HH:mm"),
            nature: appsmith.store.nature,
            questioncount: questioncount,
            minutes: minutes,
            domains: appsmith.store.domains,
        };

        storeValue("report", report, false);
        console.log(report);
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

                this.getResults();

                // Optional: Automatisch zur Auswertung navigieren
                navigateTo("Evaluation", {}, "SAME_WINDOW");
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
                navigateTo("Evaluation", {}, "SAME_WINDOW");
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
        return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    },
	
	  saveTest: async () => {
			// 1. Den laufenden Timer im Browser stoppen, damit die Zeit nicht weiterläuft
			if (appsmith.store.timerInterval) {
					clearInterval(appsmith.store.timerInterval);
					await storeValue("timerInterval", null); // Im Appsmith-Store zurücksetzen
			}

			const currentQuestions = appsmith.store.currentQuestions;
			const nrquestions = appsmith.store.nrquestions;
			const currentIndex = appsmith.store.currentIndex;
			const nature =  appsmith.store.nature;
			const mins = appsmith.store.mins;
			const timeLeft = appsmith.store.timeLeft;
			const testProgress = appsmith.store.testProgress;
			const title = appsmith.store.title;
			
			const qstions = currentQuestions.map(q => {
				return {
					_id: q._id,
					countWrong: q.countWrong,
					hasBookmark: q.hasBookmark,
					userAnswer: q.userAnswer, 
					isCorrect: q.isCorrect
				}
			});
			
			const testBackup = {
				timeLeft: timeLeft,
				testProgress: testProgress,
				currentIndex: currentIndex,
				currentQuestions: qstions,
				ntquestions: nrquestions,
				min: mins, 
				nature: nature,
				title: title
			};
			
			console.log(testBackup);
			
			const result = await PauseTest.run({
				 backupData: testBackup
			 });
			
			console.log(result);

    },
};
