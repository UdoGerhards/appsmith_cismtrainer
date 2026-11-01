export default {

	// Initialisierung beim Laden der App / Seite
	initData: async () => {

		await clearStore();

		await FindCurrentUser.run();
		const user = FindCurrentUser.data?.[0] || FindCurrentUser.data?.response?.[0] || null;

		await GetQuestionSource.run();

		if (user && user._id) {
			console.log("User gefunden:", user);
			// Speichert die ID (oder E-Mail) im Store (flüchtig für diese Session)
			await storeValue('user', user._id, false);
		} 

		await this.setTitle();

		if (!appsmith.store.myDomains) {
			showAlert("Resetting domains!", "info");
			await storeValue('myDomains', [
				{ id: 1, label: "Domain 1 - Information Security Governance", checked: false, value: null },
				{ id: 2, label: "Domain 2 - Information Security Risk Management", checked: false, value: null },
				{ id: 3, label: "Domain 3 - Information Security Program Development and Management", checked: false, value: null },
				{ id: 4, label: "Domain 4 - Information Security Incident Management", checked: false, value: null }
			]);
		}

		await storeValue("defaultQuestionCount", 0 , false);
		await storeValue("defaultTime", 0 , false);

		await storeValue("timePerQuestion", 1.6, false);

		const selectedDomainsWithValue = appsmith.store.myDomains;
		await this.countAvailableQuestions(selectedDomainsWithValue);
	},

	getCollection: ()=> {
		return "master_question";
	},

	getDistinctQuestionSource: () => {
		const rawData = GetQuestionSource.data?.values || [];

		const sourceLabel = {
			"gemini_question": "Gemini set",
			"iquestion": "ISACA set",
			"question": "Preparation set"
		};


		const questionSource = rawData.map((source, index) => ({
			id: index,
			source: sourceLabel[source], 
			value: source
		}));

		return questionSource;
	},

	setTitle: async() => {

		const now = new Date();

		const day = String(now.getDate()).padStart(2, '0');
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const year = now.getFullYear();

		const hours = String(now.getHours()).padStart(2, '0');
		const minutes = String(now.getMinutes()).padStart(2, '0');

		const formattedDateTime = `${day}.${month}.${year} ${hours}:${minutes}, CISM Test`;
		await storeValue("title", formattedDateTime, false);

	},

	getQuestionSet: () => {				
		return Source.selectedOptionValues;
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
	
	getSelectedGroupErrorFrequency: () => {
		
		console.log("Selected error frequency: ", ErrorFrequency.value)
		
		return ErrorFrequency.value;
	},
	
	disableWrongFilters: async() => {
		
		showAlert(JSON.stringify(QuestionsWithError.isSwitchedOn), "info");
		
		if (!QuestionsWithError.isSwitchedOn) {
			showAlert("Diabling error filters!!!", "info");
			ReverseOrder.setValue(false);
			ReverseOrder.setDisabled(true);
			TopCountWrong.setValue(false);
			TopCountWrong.setDisabled(true);
		} else{
			ReverseOrder.setDisabled(false);
			TopCountWrong.setDisabled(false)
		}
		
		await this.countAvailableQuestions();
		
	},
	
	disableReverseOrder: async () => {
		
		if (QuestionsWithError.isSwitchedOn && TopCountWrong.isSwitchedOn) {
			ReverseOrder.setValue(false);
		}
		
		await this.countAvailableQuestions();
		await this.calculateCountGoupedByErrorFrequency();
		//await showAlert(JSON.stringify(this.getSelectedGroupErrorFrequency()), "info");
		
	},
	
	disableTopCountWrong: async() => {
		
		if (QuestionsWithError.isSwitchedOn && ReverseOrder.isSwitchedOn) {
			TopCountWrong.setValue(false);
		}
		
		await this.countAvailableQuestions();
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
			await storeValue("defaultQuestionCount", 150 , false);
			await storeValue("defaultTime", 240 , false);
		} else if (selected=== 2) {
			await storeValue('myDomains', [
				{ id: 1, label: "Domain 1 - Information Security Governance", checked: true, value: 17 },
				{ id: 2, label: "Domain 2 - Information Security Risk Management", checked: true, value: 20 },
				{ id: 3, label: "Domain 3 - Information Security Program Development and Management", checked: true, value: 33 },
				{ id: 4, label: "Domain 4 - Information Security Incident Management", checked: true, value: 30 }
			]);
			await storeValue("defaultQuestionCount", 150 , false);
			await storeValue("defaultTime", 240 , false);
		} else if (selected === 3) {
			await storeValue('myDomains', [
				{ id: 1, label: "Domain 1 - Information Security Governance", checked: false, value: null },
				{ id: 2, label: "Domain 2 - Information Security Risk Management", checked: false, value: null },
				{ id: 3, label: "Domain 3 - Information Security Program Development and Management", checked: false, value: null },
				{ id: 4, label: "Domain 4 - Information Security Incident Management", checked: false, value: null }
			]);
			await storeValue("defaultQuestionCount", 0 , false);
			await storeValue("defaultTime", 0 , false);
		}

		const selectedDomainsWithValue = appsmith.store.myDomains;
		await this.countAvailableQuestions(selectedDomainsWithValue);

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

		const wanted = this.getCountQuestions();

		if (wanted > appsmith.store.questionsAvailable) {
			const maxQuestionCount = appsmith.store.questionsAvailable;
			CountQuestions.setValue(maxQuestionCount);
		} else if (appsmith.store.questionsAvailable === 0) {
			CountQuestions.setValue(0);
		}

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

	countAvailableQuestions: async (selectedDomainsWithValue) => {
		if (!selectedDomainsWithValue) {
			selectedDomainsWithValue = this.getSelectedDomains();
		}
		console.log(selectedDomainsWithValue);

		// Sauberer Filter für die Domains
		const domains = selectedDomainsWithValue
		.map(domain => domain.checked ? domain.label : null)
		.filter(Boolean);

		const questionSets = this.getQuestionSet();
		const onlyCountWrong = QuestionsWithError.isSwitchedOn;

		// Query ausführen und Collection + Parameter übergeben
		const result = await AvailableQuestions.run({
			collection: this.getCollection(), 
			domains: domains, 
			origins: questionSets,
			onlyWrong: onlyCountWrong
		});

		console.log("Result ", result);  

		// Korrektur von item.total auf item.totalCount
		const totalSum = (result || []).reduce((sum, item) => sum + (item.totalCount || 0), 0);
		console.log("Gesamtsumme aller Fragen: ", totalSum);

		await storeValue("questionsAvailable", totalSum, false);

		const countQuestions = this.getCountQuestions();

		if (totalSum < countQuestions) {
			CountQuestions.setValue(totalSum);
		}
	},
	
	calculateCountGoupedByErrorFrequency: async() => {
		
		showAlert("Grouping by errors!", "info");
		
		const selecteDomainsWithValue = this.getSelectedDomains();
		const domains = selecteDomainsWithValue.map(domain => domain.label);
		const onlyCountWrong = QuestionsWithError.isSwitchedOn;
		const questionSets = this.getQuestionSet();
		//const errorReverseOrder = ReverseOrder.isSwitchedOn;
		
		try {
			const result = await GroupedByErrorCount.run({
					collection: this.getCollection(), 
					domains: domains,
					onlyWrong: onlyCountWrong,
					origins: questionSets
			});
			
			await storeValue("groupedErrorFrequency", result, false);

			return result;
		} catch(e){
			console.error("Fehler beim Abfragen der gruppierten Fehlerhäufigkeit!");
			return null;
		}
		
	},

getErrorGroupedTestContent: async () => {

    console.log("===============> getErrorGroupedTestContent");

    const countQuestions = this.getCountQuestions();
    const startErrorGroup = this.getSelectedGroupErrorFrequency();
    const groupedErrorFrequency = appsmith.store.groupedErrorFrequency || [];

    const selectedDomainsWithValue = this.getSelectedDomains();
    const domains = selectedDomainsWithValue.map(domain => domain.label);

    const questionSets = this.getQuestionSet();

    // Nur die ausgewählten Fehlergruppen berücksichtigen
    const errorGroupsUnsorted = groupedErrorFrequency.filter(
        item => item.errorCount <= startErrorGroup
    );
	
	 	const errorGroups = errorGroupsUnsorted.reverse();

    let excludeIds = [];
    let testQuestions = [];
    let remainingQstCnt = countQuestions;

    for (const errorGroup of errorGroups) {

        // Abbrechen, sobald die gewünschte Anzahl erreicht ist
        if (remainingQstCnt <= 0) break;

        const errorGroupQuestionCount = Number(errorGroup.questionCount);

        const neededQuestionCount = Math.min(
            remainingQstCnt,
            errorGroupQuestionCount
        );

			  console.log("DOMAINS: ", domains);
			/*
        const qstParams = [];
					qstParams.push({
            domain: domains,
            count: neededQuestionCount,
            onlyWrong: true,
            errorGroup: errorGroup.errorCount,
            origins: questionSets,
            errorReverseOrder: false
        });
				*/
			const qstParams = {
					domain: domains,
					count: neededQuestionCount,
					onlyWrong: true,
					errorGroup: errorGroup.errorCount,
					origins: questionSets,
					errorReverseOrder: false
			};

        console.log(
            `=> getErrorGroupedTestContent: Loading ErrorGroup ${errorGroup.errorCount} / ${errorGroup.questionCount}, requested: ${neededQuestionCount}`
        );

        const groupQuestions = await this.loadDomainQuestions(
            qstParams,
            excludeIds
        );

        // Nur die tatsächlich noch benötigte Anzahl übernehmen
        const acceptedQuestions = groupQuestions.slice(0, remainingQstCnt);

        testQuestions.push(...acceptedQuestions);

        // Bereits geladene Fragen ausschließen
        excludeIds = testQuestions.map(
            question => question._id.toString()
        );

        // Verbleibende Anzahl aktualisieren
        remainingQstCnt = countQuestions - testQuestions.length;

        console.log(
            `=> getErrorGroupedTestContent: ErrorGroup ${errorGroup.errorCount}: ${groupQuestions.length} geladen, ${acceptedQuestions.length} übernommen.`
        );

        console.log("Remaining questions:", remainingQstCnt);
    }

    console.log("Total test questions:", testQuestions.length);
    console.log("Target questions:", countQuestions);
	
		const domainsInQuestions = [];
	  const countWrongInQuestions = [];
	
		testQuestions.map(question => {
			domainsInQuestions.push(question.domain);
			countWrongInQuestions.push(question.countWrong);
		})

		const domainsInQuestionsUnique = [...new Set(domainsInQuestions)];
		console.log("Enthalten domains: ", domainsInQuestionsUnique);

		const countWrongInQuestionsUnique = [...new Set(countWrongInQuestions)];
		console.log("Enhaltenen Fehlergruppen: ", countWrongInQuestionsUnique);


    return testQuestions;
},
/*
getRegurlarTestContent: async () => {
	  console.log("================> getRegularTestContent");
		const countQuestions = this.getCountQuestions();
		const selecteDomainsWithalue = this.getSelectedDomains();
		const onlyCountWrong = QuestionsWithError.isSwitchedOn;
		const errorReverseOrder = ReverseOrder.isSwitchedOn;

		const totalPercentageValue = Number(this.getTotalValue());
		let remainingPercentage = 0;

		if (totalPercentageValue > 100) {
			showAlert("Inkorrekte Prozentwerte (>100 %), "+totalPercentageValue, "warning");
			return false;
		} else if (totalPercentageValue < 100) {
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

		console.log(selecteDomainsWithalue);

		// 1. Ursprüngliche Fragen laden (mit leerem excludeIds-Array)
		let testQuestions = await this.loadDomainQuestions(domains, []);

		// Aktuelle IDs für den Ausschluss sammeln
		let excludeIds = testQuestions.map(question => question._id.toString());
		console.log("Exclude Ids after Pass 1: ", excludeIds);

		// 2. Ersten Durchgang auffüllen (falls durch Abrunden zu wenig da sind)
		const fillUp = countQuestions - testQuestions.length;
		console.log("Remaining rest number of questions to fill: ", fillUp);

		const collection = this.getCollection();
		const questionSets = this.getQuestionSet();

		if (fillUp > 0 && domains.length > 0) {
			const fillUpCountPerDomain = Math.floor(fillUp / domains.length);
			console.log("Test questions will be filled up with ", fillUpCountPerDomain, " per domain!");

			if (fillUpCountPerDomain >= 1) {
				/*
				const fillUpDomains = domains.map(domain => {
					return {
						collection: collection,
						domain: domain.domain,
						count: fillUpCountPerDomain,
						onlyWrong: onlyCountWrong,
						origins: questionSets,
						errorGroup: [],
						errorReverseOrder: errorReverseOrder
					}
					});
	
				 const fillUpDomains = {
					 	collection: collection,
						domain: rawDomainNames,
						count: fillUpCountPerDomain,
						onlyWrong: onlyCountWrong,
						origins: questionSets,
						errorGroup: [],
						errorReverseOrder: errorReverseOrder
				 }

				const fillUpQuestions = await this.loadDomainQuestions(fillUpDomains, excludeIds);
				testQuestions = [...testQuestions, ...fillUpQuestions];

				// excludeIds für den letzten Schritt aktualisieren
				excludeIds = testQuestions.map(question => question._id.toString());
			}
		}

		// 3. Den allerletzten Rest (durch Rundungsreste z. B. 1-2 Fragen) zufällig auffüllen
		let remainingFillUp = countQuestions - testQuestions.length;

		if (remainingFillUp > 0 && domains.length > 0) {
			console.log("Filling up absolute rest of: ", remainingFillUp);

			for (let i = 0; i < remainingFillUp; i++) {
				const randomDomain = rawDomainNames[i % rawDomainNames.length];

				const singleQuestion = await this.loadDomainQuestions([{
					collection: collection,
					domain: [randomDomain],
					count: 1,
					onlyWrong: onlyCountWrong,
					origins: questionSets,
					errorGroup: [],
					errorReverseOrder: errorReverseOrder
				}], excludeIds);

				testQuestions = [...testQuestions, ...singleQuestion];

				// excludeIds laufend erweitern
				excludeIds = testQuestions.map(question => question._id.toString());
			}
		}

		console.log("Final testQuestions length: ", testQuestions.length, " (Target: ", countQuestions, ")");
		console.log("All test questions: ", testQuestions);

		const isUnique = {};

		// .forEach ist hier die richtige Wahl für reine Aktionen
		testQuestions.forEach(question => {
			isUnique[question.origin] = 1;
		});

		// Nachricht und JSON mit "+" zusammenfügen (genau 2 Parameter für showAlert)
		console.log("Unique test: " + JSON.stringify(isUnique), "info");

		testQuestions = await this.findBookmarks(testQuestions);
		await this.updateSelectedUsage(testQuestions);
		
		const shuffleQuestions = (array) => {
			// Kopie des Arrays erstellen, um das Original nicht zu verändern
			const arr = [...array];

			// Fisher-Yates Algorithmus
			for (let i = arr.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[arr[i], arr[j]] = [arr[j], arr[i]]; // Elemente tauschen
			}

			return arr;
		};

		testQuestions = shuffleQuestions(testQuestions);
		console.log("Test questions: ", testQuestions);
	
		return testQuestions;
	},
*/
	getRegurlarTestContent: async () => {
			console.log("================> getRegularTestContent");

			const countQuestions = this.getCountQuestions();
			const selecteDomainsWithalue = this.getSelectedDomains();
			const onlyCountWrong = QuestionsWithError.isSwitchedOn;
			const errorReverseOrder = ReverseOrder.isSwitchedOn;

			const totalPercentageValue = Number(this.getTotalValue());

			if (totalPercentageValue > 100) {
					showAlert("Inkorrekte Prozentwerte (>100 %), " + totalPercentageValue, "warning");
					return false;
			} else if (totalPercentageValue < 100) {
					showAlert("Inkorrekte Prozentwerte (<100 %), " + totalPercentageValue, "warning");
					return false;
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
					};
			});

			console.log(selecteDomainsWithalue);

			const collection = this.getCollection();
			const questionSets = this.getQuestionSet();

			// 1. Ursprüngliche Fragen laden: Prozentuale Verteilung pro Domain
			let testQuestions = [];

			for (const domain of domains) {
					if (domain.count <= 0) continue;

					const domainQuestions = await this.loadDomainQuestions({
							domain: [domain.domain],
							count: domain.count,
							onlyWrong: domain.onlyWrong,
							origins: questionSets,
							errorGroup: [],
							errorReverseOrder: errorReverseOrder
					}, []);

					testQuestions.push(...domainQuestions);
			}

			// Aktuelle IDs für den Ausschluss sammeln
			let excludeIds = testQuestions.map(question => question._id.toString());
			console.log("Exclude Ids after Pass 1: ", excludeIds);

			// 2. Ersten Durchgang auffüllen (falls durch Abrunden zu wenig da sind)
			const fillUp = countQuestions - testQuestions.length;
			console.log("Remaining rest number of questions to fill: ", fillUp);

			if (fillUp > 0 && domains.length > 0) {
					const fillUpCountPerDomain = Math.floor(fillUp / domains.length);

					console.log("Test questions will be filled up with ", fillUpCountPerDomain, " per domain!");

					if (fillUpCountPerDomain >= 1) {
							const fillUpDomains = {
									collection: collection,
									domain: rawDomainNames,
									count: fillUpCountPerDomain,
									onlyWrong: onlyCountWrong,
									origins: questionSets,
									errorGroup: [],
									errorReverseOrder: errorReverseOrder
							};

							const fillUpQuestions = await this.loadDomainQuestions(fillUpDomains, excludeIds);
							testQuestions = [...testQuestions, ...fillUpQuestions];

							// excludeIds für den letzten Schritt aktualisieren
							excludeIds = testQuestions.map(question => question._id.toString());
					}
			}

			// 3. Den allerletzten Rest zufällig auffüllen
			const remainingFillUp = countQuestions - testQuestions.length;

			if (remainingFillUp > 0 && domains.length > 0) {
					console.log("Filling up absolute rest of: ", remainingFillUp);

					for (let i = 0; i < remainingFillUp; i++) {
							const randomDomain = rawDomainNames[i % rawDomainNames.length];

							const singleQuestion = await this.loadDomainQuestions({
									collection: collection,
									domain: [randomDomain],
									count: 1,
									onlyWrong: onlyCountWrong,
									origins: questionSets,
									errorGroup: [],
									errorReverseOrder: errorReverseOrder
							}, excludeIds);

							testQuestions = [...testQuestions, ...singleQuestion];

							// excludeIds laufend erweitern
							excludeIds = testQuestions.map(question => question._id.toString());
					}
			}

			console.log("Final testQuestions length: ", testQuestions.length, " (Target: ", countQuestions, ")");
			console.log("All test questions: ", testQuestions);

			const isUnique = {};

			testQuestions.forEach(question => {
					isUnique[question.origin] = 1;
			});

			console.log("Unique test: " + JSON.stringify(isUnique), "info");

			testQuestions = await this.findBookmarks(testQuestions);
			await this.updateSelectedUsage(testQuestions);

			const shuffleQuestions = (array) => {
					const arr = [...array];

					for (let i = arr.length - 1; i > 0; i--) {
							const j = Math.floor(Math.random() * (i + 1));
							[arr[i], arr[j]] = [arr[j], arr[i]];
					}

					return arr;
			};

			testQuestions = shuffleQuestions(testQuestions);
			console.log("Test questions: ", testQuestions);

			return testQuestions;
	},

	calculateTestContent: async () => {
		const title = this.getTitle();
		const countQuestions = this.getCountQuestions();
		const time = this.getTimeTotal();
		const selectedDomainsWithalue = this.getSelectedDomains();
		const onlyCountWrong = QuestionsWithError.isSwitchedOn;
		let rawDomains = selectedDomainsWithalue.map(domain => domain.label);
		
		let testQuestions = TopCountWrong.isSwitchedOn ? await this.getErrorGroupedTestContent(): await this.getRegurlarTestContent();
		
		const shuffleQuestions = (array) => {
			// Kopie des Arrays erstellen, um das Original nicht zu verändern
			const arr = [...array];

			// Fisher-Yates Algorithmus
			for (let i = arr.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[arr[i], arr[j]] = [arr[j], arr[i]]; // Elemente tauschen
			}

			return arr;
		};

		testQuestions = shuffleQuestions(testQuestions);
		console.log("Test questions: ", testQuestions);
		
		const allDomains = testQuestions.map(question => question.domain);
		const uniqueDomains =  [...new Set(allDomains)];
		console.log("Enthaltene Domains: ", uniqueDomains);
		
		const allErrorGroups = testQuestions.map(question => question.countWrong);
		const uniqueErrorGroups = [...new Set(allErrorGroups)];
		console.log("Enthaltene Fehlergruppen: ", uniqueErrorGroups);
		

		
		// Prepare test data
		await storeValue('title', title, false);
		await storeValue('nrquestions', parseInt(countQuestions), false);
		await storeValue('mins', parseInt(time), false);
		await storeValue("domains", rawDomains, false);

		await storeValue("currentQuestions", testQuestions, false);
		await storeValue("currentIndex", 0, false);

		if (!onlyCountWrong) {
			await storeValue('nature', 'user');
		} else {
			await storeValue('nature', "ET");
		}
		
		console.log("Nauture: ", appsmith.store.nature);

		//await navigateTo("Execution", {}, 'SAME_WINDOW');
	},

	/*
	loadDomainQuestions: async (domains, excludeIds = []) => {
		console.log("================> loadDomainQuestions");
		
		let testQuestions = [];

		for (const domain of domains) {
			console.log("Domain:", domains.domain);
			console.log("ErrorGroup:", domains.errorGroup);
			console.log("Requested:", domains.count);
			
			if (domain.count <= 0) continue;

			const collection = this.getCollection();

			const domainQuestions = await GetQuestions.run({
				collection: collection,
				domain: domain.label || domain.domain,
				questionLimit: domain.count,
				onlyWrong: domain.onlyWrong,
				excludeIds: excludeIds,
				origins: domain.origins,
				errorGroup: domain.errorGroup,
				errorReverseOrder: domain.errorReverseOrder
			});
			
			console.log("GetQuestions params:", {
					collection: collection,
					domain: domain.label || domain.domain,
					questionLimit: domain.count,
					errorGroup: domain.errorGroup,
					origins: domain.origins
			});

			console.log("GetQuestions result:", {
					isArray: Array.isArray(domainQuestions),
					length: domainQuestions?.length,
					result: domainQuestions
			});

			if (domainQuestions && Array.isArray(domainQuestions)) {
				testQuestions = [...testQuestions, ...domainQuestions];
			}
			
			console.log("Domain: ", domain);
			console.log("Returned:", domainQuestions?.length);
		}

		return testQuestions;
	},
	
	loadDomainQuestions: async (domains, excludeIds = []) => {
			console.log("================> loadDomainQuestions");

			const domainArray = [...new Set(
					(domains || [])
							.flatMap(item => Array.isArray(item.domain)
									? item.domain
									: [item.label || item.domain]
							)
							.filter(Boolean)
			)];

			const questionLimit = Number(domains?.[0]?.count) || 0;

			if (questionLimit <= 0 || domainArray.length === 0) {
					return [];
			}

			const collection = this.getCollection();

			const params = {
					collection: collection,
					domain: domainArray,
					questionLimit: questionLimit,
					onlyWrong: domains[0].onlyWrong,
					excludeIds: excludeIds,
					origins: domains[0].origins,
					errorGroup: domains[0].errorGroup,
					errorReverseOrder: domains[0].errorReverseOrder
			};

			console.log("GetQuestions params:", params);

			const domainQuestions = await GetQuestions.run(params);

			console.log("GetQuestions result:", {
					domains: domainArray,
					requested: questionLimit,
					returned: domainQuestions?.length
			});

			return Array.isArray(domainQuestions) ? domainQuestions : [];
	},
		*/
	
	loadDomainQuestions: async (domains, excludeIds = []) => {
			console.log("================> loadDomainQuestions");

			const collection = this.getCollection();

			const params = {
					collection: collection,
					domain: domains.domain,
					questionLimit: domains.count,
					onlyWrong: domains.onlyWrong,
					excludeIds: excludeIds,
					origins: domains.origins,
					errorGroup: domains.errorGroup,
					errorReverseOrder: domains.errorReverseOrder
			};

			console.log("GetQuestions params:", params);

			const domainQuestions = await GetQuestions.run(params);

			console.log("GetQuestions result:", {
					domains: domains.domain,
					requested: domains.count,
					returned: domainQuestions?.length
			});

			return Array.isArray(domainQuestions) ? domainQuestions : [];
	},

	findBookmarks: async(questions) => {

		const allIds = questions.map(question => question._id);
		const result = await GetBookmarks.run({
			ids: allIds
		});
		
		const bookmarkedIds = new Set((result || []).map(b => b.questionId));
		questions = questions.map(question => {
				return {
						...question,
						hasBookmark: bookmarkedIds.has(question._id.toString()) // true, wenn ID in Bookmarks existiert, sonst false
				};
		});
		
		//console.log("Questions with bookmark field: ", questions);
		
		return questions;
	},

	updateSelectedUsage: async (questions) => {
		// 1. Berliner Zeit generieren
		const berlinTime = moment().tz('Europe/Berlin').format();

		console.log("Berlin time: ", berlinTime);
		console.log("Questions array: ", questions);

		const collectionArray = {};

		questions.forEach(question => {
			const collection = question.origin;

			// HIER DIE KORREKTUR: Initialisieren, falls noch nicht vorhanden
			if (!collectionArray[collection]) {
				collectionArray[collection] = [];
			}

			if (typeof question._id == 'string') {
				collectionArray[collection].push({ "$oid": question._id });
			} else {
				collectionArray[collection].push(question._id);
			}
		});

		//console.log("IDs to update grouped by origin: ", collectionArray);

		// 2. Für jede Gruppe die Query ausführen
		for (const [collection, idsArray] of Object.entries(collectionArray)) {
			await UpdateQuestionQuery.run({
				collection: collection, 
				ids: idsArray,
				currentDate: berlinTime
			}); 
		}
	}
}
