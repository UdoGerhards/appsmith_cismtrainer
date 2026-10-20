export default {
		countAvailableQuestions: async (selectedDomainsWithValue) => {
			//await showAlert("Triggered");

			if (!selectedDomainsWithValue){
				selectedDomainsWithValue = QuizConfig.getSelectedDomains();
				}
			
			console.log(selectedDomainsWithValue);

			// Sauberer Filter für die Domains
			const domains = selectedDomainsWithValue
					.map(domain => domain.checked ? domain.label : null)
					.filter(Boolean);

			const onlyCountWrong = QuestionsWithError.isSwitchedOn;

			// Query ausführen und auf das Ergebnis warten
			const result = await AvailableQuestions.run({
					domains: domains,
					onlyWrong: onlyCountWrong,
				  origins: QuizConfig.getSourceSelected()
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
							excludeIds: excludeIds
					});

					if (domainQuestions && Array.isArray(domainQuestions)) {
							testQuestions = [...testQuestions, ...domainQuestions];
					}
			}

			return testQuestions;
	}
}