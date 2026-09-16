export default {
	clickCount: 0,
  timer: null,
	
  async onPageLoad() {
    // Löscht das report-Objekt aus dem Appsmith-Store
    await removeValue("report");
    console.log("Seite geladen: 'report' wurde erfolgreich aus dem Store gelöscht.");
		
		await FindCurrentUser.run();
		const user = FindCurrentUser.data?.[0] || FindCurrentUser.data?.response?.[0] || null;

		if (user && user._id) {
			console.log("User gefunden:", user);
			// Speichert die ID (oder E-Mail) im Store (flüchtig für diese Session)
			await storeValue('user', user._id, false);
		} else {
			console.log("Kein User gefunden. Entferne Variable aus dem Store.");
			// Löscht die Variable 'user' komplett aus dem Appsmith-Store
			await removeValue('user');
		}
		
		await GetAllTests.run();
		
  },
	
getAllTests: () => {
		// Hole die Daten aus der Query (Sicherheits-Fallback auf leeres Array)
		const rawData = GetAllTests.data || [];
		
		console.log("Raw test data ", rawData);

		// Hilfsfunktion: Wandelt "19.08.2026 16:19" in einen Zeitstempel (Millisekunden) um
		const parseGermanDate = (dateStr) => {
			if (!dateStr || typeof dateStr !== "string") return 0;
			try {
				// Trennt "19.08.2026" und "16:19"
				const [datePart, timePart] = dateStr.split(" ");
				// Trennt Tag, Monat, Jahr
				const [day, month, year] = datePart.split(".");
				// Baut das ISO-Format "YYYY-MM-DDTHH:mm:00" nach
				const isoString = `${year}-${month}-${day}T${timePart || "00:00"}:00`;
				return new Date(isoString).getTime() || 0;
			} catch (e) {
				return 0; // Fallback für fehlerhafte Daten
			}
		};

		const tableData = rawData
			// 1. Optionaler Filter im Frontend
			.filter(doc => doc.nature !== "")
			
			// 2. Sortierung absteigend nach dem Feld 'finsihed' (aktuellste zuerst)
			.slice()
			.sort((a, b) => {
				const timeA = parseGermanDate(a.finsihed);
				const timeB = parseGermanDate(b.finsihed);
				return timeB - timeA; // Höchster Zeitstempel (neuestes Datum) nach oben
			})
			
			// 3. Spalten für die Tabelle aufbereiten
			.map(doc => {
				const questionCount = doc.questions ? doc.questions.length : 0;
				const percentageCorrect = questionCount > 0
					? Math.round((doc.correct / questionCount) * 100)
					: 0;

				return {
					"id": doc._id?.$oid || doc._id?.toString() || "",
					"Wiederholung": doc.nature,
					"Durchgeführt": doc.finsihed,
					"Test": doc.name || "Unbenannt",
					"Minuten": doc.minutes || 0,
					"Anzahl Fragen": questionCount,
					"Korrekt": doc.correct || 0,
					"Falsch": doc.incorrect || 0,
					"Prozent Korrect von questioncount": percentageCorrect + "%"
				};
			});
		
		console.log("Table data: ", tableData);
		
		return tableData;
	},

	
	async handleSelection() {
		// 1. Führe den Query GetTest aus und warte auf das Ergebnis
		const result = await GetTest.run();

		// 2. Überprüfe, ob ein Dokument gefunden wurde (result ist bei Find meist ein Array)
		if (result && result.length > 0) {
			const document = result[0];
			
			const selectedIds = document.questions.map(question => question._id);
			
			//console.log("IDS Array: ", selectedIds);
			
			await GetQuestions.run({ids: selectedIds});
			
			const questions = GetQuestions.data?.cursor?.firstBatch 
												|| GetQuestions.data 
												|| [];
			
			console.log("Fragen: ", questions);
			
			if (questions.length > 0 ){
				
				const questionsMap = new Map();
				questions.forEach(item => {
					questionsMap.set(item._id.toString(), item);
				});
				
				const updatedQuestions = document.questions.map(q => {
					const detail = questionsMap.get(q._id.toString()) || {};

					return {
						...q, // Behält userAnswer und isCorrect bei
						question: detail.question || "", // Text der Frage aus der DB
						correct: detail.correct || "",   // Die korrekte Antwort aus der DB
						domain: detail.domain || "",     // Domain der Frage
						answers: detail.answers || []    // Die Antwortmöglichkeiten aus der 'answer'-Collection (vom Lookup)
					};
				});
				
				document.questions = updatedQuestions;
				//console.log("Aktualsierte Fragen: ", updatedQuestions);
			}

			console.log('Report: ', document);
			
			// 3. Speichere das Dokument plus das neue Feld im Store
			await storeValue("report", {
				...document,
				synthetic: true
			});
			
			console.log(appsmith.store.report);
			
			await navigateTo('Evaluation', {}, 'SAME_WINDOW');

			showAlert("Report wurde geladen und gespeichert!", "success");
		} else {
			showAlert("Dokument konnte nicht gefunden werden", "error");
		}
	},

  // 1. Wird beim Klick auf den Icon-Button in der Tabelle ausgeführt
  deleteRecord: async (rowData) => {
    // Sicherstellen, dass wir eine ID haben (entweder mongoId oder fallback auf id)
    const id = rowData?.mongoId || rowData?.id;
    
    if (!id) {
      showAlert("Keine ID gefunden!", "error");
      return;
    }

    // Titel für das Modal im Store speichern
    await storeValue('entry_title', (rowData["Durchgeführt"] || "") + ", " + (rowData["Test"] || "Unbenannt"), false);
    
    // Die ID für den Löschvorgang zwischenspeichern
    await storeValue('idToDelete', id, false);

    // Modal öffnen
    showModal("ConfirmDeleteModal");
  },

  // 2. Wird beim Klick auf den Bestätigungs-Button im Modal ausgeführt
  confirmDelete: async () => {
    const id = appsmith.store.idToDelete;
		
		console.log("ID ", id);

    if (!id) {
      showAlert("Keine ID zum Löschen im Store gefunden!", "error");
      return;
    }

    try {
      // Direkt die Query aufrufen und die ID übergeben
      await DeleteTest.run({ id: id });
      
      // Tabelle aktualisieren
      await GetAllTests.run(); 
      
      // Aufräumen und Modal schließen
      closeModal("ConfirmDeleteModal");
      await removeValue('entry_title');
      await removeValue('idToDelete');
      
      showAlert("Datensatz erfolgreich gelöscht", "success");
    } catch (e) {
      showAlert("Fehler beim Löschen: " + (e.message || e), "error");
    }
  }
}