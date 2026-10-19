export default {
	
	// Initialisierung beim Laden der App / Seite
  initData: async () => {
		
		await clearStore();
		
		await FindCurrentUser.run();
		const user = FindCurrentUser.data?.[0] || FindCurrentUser.data?.response?.[0] || null;

		if (user && user._id) {
			console.log("User gefunden:", user);
			// Speichert die ID (oder E-Mail) im Store (flüchtig für diese Session)
			await storeValue('user', user._id, false);
		} 
		
    if (!appsmith.store.myDomains) {
      await storeValue('myDomains', [
        { id: 1, label: "Domain 1 - Information Security Governance", checked: false, value: null },
        { id: 2, label: "Domain 2 - Information Security Risk Management", checked: false, value: null },
        { id: 3, label: "Domain 3 - Information Security Program Development and Management", checked: false, value: null },
        { id: 4, label: "Domain 4 - Information Security Incident Management", checked: false, value: null }
      ]);
    }
		
		await storeValue("timePerQuestion", 1.6, false);
		
		await this.countAvailableQuestions();
  },

  // Gibt die aktuellen Daten aus dem Store zurück
  getDomains: () => {
    return appsmith.store.myDomains || [];
  },
	
	getSelectedDomains: () => {
		console.log(Domains.model.list);
    const list = Domains.model?.list || [];
    return list.filter(item => item.checked);
  },
	
	getTotalValue: () => {
    const selected = this.getSelectedDomains();
    return selected.reduce((sum, item) => sum + Number(item.value || 0), 0);
  },
	
	getCountQuestions: ()  => {
		return Number(CountQuestions.text);
	},
	
	getTimeTotal: () => {
		return Number(TotalTime.text);
	},
	
	getTitle: () => {
		return Title.text;
	},
	
	selectExamSet: async() => {
		const selected = Number(ExamStyle.selectedOptionValue);
		console.log("Exam style selected: ", selected);
		
		if (selected === 1 ) {
			  await storeValue('myDomains', [
        { id: 1, label: "Domain 1 - Information Security Governance", checked: true, value: 18 },
        { id: 2, label: "Domain 2 - Information Security Risk Management", checked: true, value: 28 },
        { id: 3, label: "Domain 3 - Information Security Program Development and Management", checked: true, value: 33 },
        { id: 4, label: "Domain 4 - Information Security Incident Management", checked: true, value: 29 }
      ]);
		} else if (selected=== 2) {
			  await storeValue('myDomains', [
        { id: 1, label: "Domain 1 - Information Security Governance", checked: true, value: 17 },
        { id: 2, label: "Domain 2 - Information Security Risk Management", checked: true, value: 20 },
        { id: 3, label: "Domain 3 - Information Security Program Development and Management", checked: true, value: 33 },
        { id: 4, label: "Domain 4 - Information Security Incident Management", checked: true, value: 30 }
      ]);
		} else if (selected === 3) {
				await storeValue('myDomains', [
        { id: 1, label: "Domain 1 - Information Security Governance", checked: false, value: null },
        { id: 2, label: "Domain 2 - Information Security Risk Management", checked: false, value: null },
        { id: 3, label: "Domain 3 - Information Security Program Development and Management", checked: false, value: null },
        { id: 4, label: "Domain 4 - Information Security Incident Management", checked: false, value: null }
      ]);
		}
		
		await this.countAvailableQuestions();
		
		return true;
	},
	
	setQuestionsCount: async () => {
		
			const blockSettingQuestionsCount = Number(appsmith.store.blockSettingQuestionsCount);
		
			if (blockSettingQuestionsCount) {
				await removeValue("blockSettingQuestionsCount");
				return;
			}
		
		  console.log(blockSettingQuestionsCount);
		
			const time = this.getTimeTotal();
			const timePerQuestion = appsmith.store.timePerQuestion;
		
			const numberQuestions = Math.floor(time / timePerQuestion);
		
			await storeValue("blockSettingQuestionsCount", true, false);
		
			CountQuestions.setValue(numberQuestions);
	},
	
	setTotalTime: async() => {
		
			const blockTimeSettings = Number(appsmith.store.blockTimeSettings);
		
			if (blockTimeSettings) {
				await removeValue("blockTimeSettings");
				return;
			}
		
		  console.log(blockTimeSettings);
		
			const questionsCount = this.getCountQuestions();
		  console.log("questionsCount ", questionsCount, typeof questionsCount);
			const timePerQuestion = appsmith.store.timePerQuestion;
		  console.log("timePerQuestion ", timePerQuestion, typeof timePerQuestion);
		
			const timeTotal = Math.ceil(questionsCount * timePerQuestion);
		  console.log(timeTotal);
		
			TotalTime.setValue(timeTotal);
		
	},
	
	countAvailableQuestions: async () => {
			await showAlert("Triggered");

			const selectedDomainsWithValue = this.getSelectedDomains();
			console.log(selectedDomainsWithValue);

			// Sauberer Filter für die Domains
			const domains = selectedDomainsWithValue
					.map(domain => domain.checked ? domain.label : null)
					.filter(Boolean);

			const onlyCountWrong = QuestionsWithError.isSwitchedOn;

			// Query ausführen und auf das Ergebnis warten
			const result = await AvailableQuestions.run({
					domains: domains,
					onlyWrong: onlyCountWrong
			});

			console.log("Result ", result);  
			const totalSum = (result || []).reduce((sum, item) => sum + (item.total || 0), 0);
			console.log("Gesamtsumme aller Fragen: ", totalSum);
		
			await storeValue("questionsAvailable", totalSum, false);
		
			const countQuestions = this.getCountQuestions();
		
			if (totalSum < countQuestions) {
				CountQuestions.setValue(totalSum);
			}
	},

calculateTestContent: async () => {

		const title = this.getTitle();
		const countQuestions = this.getCountQuestions();
		const time = this.getTimeTotal();
		const selecteDomainsWithalue = this.getSelectedDomains();
		const onlyCountWrong = QuestionsWithError.isSwitchedOn;
		
		const totalPercentageValue = Number(this.getTotalValue());
		let remainingPercentage = 0;
		
		if (totalPercentageValue > 100) {
			showAlert("Inkorrekte Prozentwerte (>100 %), "+totalPercentageValue, "warning");
			return false;
		} else if (totalPercentageValue <100) {
			showAlert("Inkorrekte Prozentwerte (<100 %), "+totalPercentageValue, "warning");
			return false;
		} else {
			remainingPercentage = 100 - totalPercentageValue;
		}
	
	 	const rawDomainNames = [];
		const domains = selecteDomainsWithalue.map(domain => {
			const domainCount = Math.floor((countQuestions * domain.value) / 100);
			console.log("Domain ", domain.label, ": ", domainCount, " (" + domain.value + ")");
			rawDomainNames.push(domain.label);
			return {
				domain: domain.label,
				count: domainCount,
				onlyWrong: onlyCountWrong
			}
		});
		
		// 1. Ursprüngliche Fragen laden (mit await!)
		let testQuestions = await this.loadDomainQuestions(domains);
		
		// 2. Ersten Durchgang auffüllen (falls durch Abrunden zu wenig da sind)
		const fillUp = countQuestions - testQuestions.length;
		console.log("Remaining rest number of questions to fill: ", fillUp);
		
		if (fillUp > 0 && domains.length > 0) {
			const fillUpCountPerDomain = Math.floor(fillUp / domains.length);
			console.log("Test questions will be filled up with ", fillUpCountPerDomain, " per domain!");
			
			if (fillUpCountPerDomain >= 1) {
				const fillUpDomains = domains.map(domain => {
					return {
						domain: domain.domain,
						count: fillUpCountPerDomain,
						onlyWrong: onlyCountWrong
					}
				});

				const fillUpQuestions = await this.loadDomainQuestions(fillUpDomains);
				testQuestions = [...testQuestions, ...fillUpQuestions]; // Korrekt mit Spread-Operator
			}
		}
	
		// 3. Den allerletzten Rest (durch Rundungsreste z. B. 1-2 Fragen) zufällig auffüllen
		let remainingFillUp = countQuestions - testQuestions.length;
		
		if (remainingFillUp > 0 && domains.length > 0) {
			console.log("Filling up absolute rest of: ", remainingFillUp);
			
			// Wir holen für die ersten 'remainingFillUp' Domains jeweils 1 weitere Frage
			for (let i = 0; i < remainingFillUp; i++) {
				const randomDomain = domains[i % domains.length]; // Verteilt es gleichmäßig auf die Domains
				
				const singleQuestion = await this.loadDomainQuestions([{
					domain: randomDomain.domain,
					questionLimit: 1,
					onlyWrong: onlyCountWrong
				}]);
				
				testQuestions = [...testQuestions, ...singleQuestion];
			}
		}
		
		console.log("Final testQuestions length: ", testQuestions.length, " (Target: ", countQuestions, ")");
	
		// Prepare test data
		await storeValue('title', title, false);
		await storeValue('nrquestions', parseInt(countQuestions), false);
		await storeValue('mins', parseInt(time), false);
	  await storeValue("domains", rawDomainNames, false);
	
		await storeValue("currentQuestions", testQuestions, false);
	  await storeValue("currentIndex", 0);
	
		if (!onlyCountWrong) {
				await storeValue('nature', 'user');
			} else {
				await storeValue('nature', "error_training");
			}
	
		await navigateTo("Execution", {}, 'SAME_WINDOW');
	},
	
	loadDomainQuestions: async (domains) => {
		let testQuestions = [];
			
		for (const domain of domains) {
			// Falls count 0 ist, überspringen wir den Aufruf
			if (domain.count <= 0 && domain.questionLimit <= 0) continue;
			
			const limit = domain.count !== undefined ? domain.count : domain.questionLimit;
			
			const domainQuestions = await GetQuestions.run({
				domain: domain.label || domain.domain,
				questionLimit: limit,
			});
			
			if (domainQuestions && Array.isArray(domainQuestions)) {
				testQuestions = [...testQuestions, ...domainQuestions];
			}
		}
		
		return testQuestions;
	}
		
}
