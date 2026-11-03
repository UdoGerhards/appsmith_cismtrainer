export default {
		countAvailableQuestions: async (selectedDomainsWithValue) => {
			//await showAlert("Triggered");

			if (!selectedDomainsWithValue){
				selectedDomainsWithValue = QuizConfig.getSelectedDomains();
				}
			
			//console.log(selectedDomainsWithValue);

			// Sauberer Filter für die Domains
			const domains = selectedDomainsWithValue
					.map(domain => domain.checked ? domain.label : null)
					.filter(Boolean);

			const onlyCountWrong = QuestionsWithError.isSwitchedOn;

			// Query ausführen und auf das Ergebnis warten
			const result = await AvailableQuestions.run({
					domains: domains,
					onlyWrong: onlyCountWrong,
				  origins: QuizConfig.getSourceSelected(),
				  bookmarksOnly: QuizConfig.getBookmarksOnly()
			});

			console.log("Result ", result);  
			const totalSum = (result || []).reduce((sum, item) => sum + (item.total || 0), 0);
			console.log("Gesamtsumme aller Fragen: ", totalSum);
		
			await storeValue("questionsAvailable", totalSum, false);
		
			const countQuestions = QuizConfig.getCountQuestions();
		
			if (totalSum < countQuestions) {
				CountQuestions.setValue(totalSum);
			}
	},
	
	loadDomainQuestions: async (domains, excludeIds = []) => {
			let testQuestions = [];

			for (const domain of domains) {
					if (domain.count <= 0 && domain.questionLimit <= 0) continue;

					const limit = domain.count !== undefined ? domain.count : domain.questionLimit;

					const domainQuestions = await GetQuestions.run({
							domain: domain.label || domain.domain,
							questionLimit: limit,
							onlyWrong: domain.onlyWrong,
							excludeIds: excludeIds,
							bookmarksOnly: QuizConfig.getBookmarksOnly()
					});

					if (domainQuestions && Array.isArray(domainQuestions)) {
							testQuestions = [...testQuestions, ...domainQuestions];
					}
			}

			return testQuestions;
	},
	
importUpload: async () => {
  if (!Upload.files || Upload.files.length === 0) {
    showAlert("Bitte wähle zuerst eine Datei aus!", "warning");
    return;
  }

  try {
    let fileData = Upload.files[0].data;
    let jsonObject = {};

    console.log("Original fileData: ", fileData);

    // 1. Schritt: Wenn es ein String ist, das erste Mal parsen
    if (typeof fileData === "string") {
      jsonObject = JSON.parse(fileData);
    } else {
      jsonObject = fileData;
    }

    // 2. Schritt: Falls das Ergebnis IMMER NOCH ein String ist (doppelte Maskierung), nochmals parsen
    if (typeof jsonObject === "string") {
      jsonObject = JSON.parse(jsonObject);
    }

    // Jetzt ist es ein echtes Objekt!
    console.log("Finales Objekt: ", jsonObject);
    console.log("Typ von jsonObject: ", typeof jsonObject);
    
    // Beispiel-Zugriff auf deine Daten:
    if (jsonObject.myDomains) {
      console.log("Domains gefunden: ", jsonObject.myDomains);
      // Hier kannst du es jetzt in den Store schreiben:
      await storeValue("myDomains", jsonObject.myDomains);
      showAlert("Domains erfolgreich importiert!", "success");
    }

  } catch (error) {
    showAlert("Fehler beim Parsen der JSON-Datei: " + error.message, "error");
  }
}

}