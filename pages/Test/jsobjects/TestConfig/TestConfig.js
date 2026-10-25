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

		// Query ausführen und Collection + Parameter übergeben
		const result = await AvailableQuestions.run({
			collection: "master_question", // <-- Wichtig: Collection-Name übergeben
			domains: domains,        // <-- Array von Domains
			origins: questionSets
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
				const fillUpDomains = domains.map(domain => {
					return {
						domain: domain.domain,
						count: fillUpCountPerDomain,
						onlyWrong: onlyCountWrong
					}
				});

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
				const randomDomain = domains[i % domains.length];

				const singleQuestion = await this.loadDomainQuestions([{
					collection: collection,
					domain: randomDomain.domain,
					questionLimit: 1,
					onlyWrong: onlyCountWrong,
					origins: questionSets
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

	loadDomainQuestions: async (domains, excludeIds = []) => {
		let testQuestions = [];

		for (const domain of domains) {
			if (domain.count <= 0 && domain.questionLimit <= 0) continue;

			const limit = domain.count !== undefined ? domain.count : domain.questionLimit;

			const questionSets = this.getQuestionSet();

			console.log("Selected question sets: ", questionSets);

			const collection = this.getCollection();

			const domainQuestions = await GetQuestions.run({
				collection: collection, 
				domain: domain.label || domain.domain,
				questionLimit: limit,
				onlyWrong: domain.onlyWrong,
				excludeIds: excludeIds,
				origins: questionSets
			});

			if (domainQuestions && Array.isArray(domainQuestions)) {
				testQuestions = [...testQuestions, ...domainQuestions];
			}
		}

		return testQuestions;
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
