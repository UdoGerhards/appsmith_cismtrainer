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
			await storeValue("user", user._id, false);
		}

		await this.setTitle();

		if (!appsmith.store.myDomains) {
			//showAlert("Resetting domains!", "info");
			await storeValue("myDomains", [
				{
					id: 1,
					label: "Domain 1 - Information Security Governance",
					checked: false,
					value: null,
				},
				{
					id: 2,
					label: "Domain 2 - Information Security Risk Management",
					checked: false,
					value: null,
				},
				{
					id: 3,
					label: "Domain 3 - Information Security Program Development and Management",
					checked: false,
					value: null,
				},
				{
					id: 4,
					label: "Domain 4 - Information Security Incident Management",
					checked: false,
					value: null,
				},
			]);
		}

		await storeValue("defaultQuestionCount", 0, false);
		await storeValue("defaultTime", 0, false);

		await storeValue("timePerQuestion", 1.6, false);

		const selectedDomainsWithValue = appsmith.store.myDomains;
		await this.countAvailableQuestions(selectedDomainsWithValue);
	},

	getCollection: () => {
		return "master_question";
	},

	getDistinctQuestionSource: () => {
		const rawData = GetQuestionSource.data?.values || [];

		const sourceLabel = {
			gemini_question: "Gemini set",
			iquestion: "ISACA set",
			question: "Preparation set",
		};

		const questionSource = rawData.map((source, index) => ({
			id: index,
			source: sourceLabel[source],
			value: source,
		}));

		return questionSource;
	},

	setTitle: async () => {
		const now = new Date();

		const day = String(now.getDate()).padStart(2, "0");
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const year = now.getFullYear();

		const hours = String(now.getHours()).padStart(2, "0");
		const minutes = String(now.getMinutes()).padStart(2, "0");

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
		//log(Domains.model.list);
		const list = Domains.model?.list || [];
		return list.filter((item) => item.checked);
	},

	getTotalValue: () => {
		const selected = this.getSelectedDomains();
		return selected.reduce((sum, item) => sum + Number(item.value || 0), 0);
	},

	getCountQuestions: () => {
		return Number(CountQuestions.text);
	},

	getTimeTotal: () => {
		return Number(TotalTime.text);
	},

	getTitle: () => {
		return Title.text;
	},

	getSet: () => {
		return ExamStyle.selectedOptionValue;
	},

	getSelectedGroupErrorFrequency: () => {
		//console.log("Selected error frequency: ", ErrorFrequency.value);

		const errorCount = Number(ErrorFrequency.value);
		const groupedErrorFrequency = appsmith.store.groupedErrorFrequency;

		const index = groupedErrorFrequency.findIndex((item) => item.errorCount === errorCount);

		const res =
					index !== -1 ? groupedErrorFrequency.slice(0, index + 1) : groupedErrorFrequency;

		//console.log("Returning error group sets ", res);

		return res;
	},

	disableWrongFilters: async () => {
		//showAlert(JSON.stringify(QuestionsWithError.isSwitchedOn), "info");

		if (!QuestionsWithError.isSwitchedOn) {
			//showAlert("Diabling error filters!!!", "info");
			ReverseOrder.setValue(false);
			ReverseOrder.setDisabled(true);
			TopCountWrong.setValue(false);
			TopCountWrong.setDisabled(true);
		} else {
			ReverseOrder.setDisabled(false);
			TopCountWrong.setDisabled(false);
		}

		await this.countAvailableQuestions();
	},

	disableReverseOrder: async () => {
		if (QuestionsWithError.isSwitchedOn && TopCountWrong.isSwitchedOn) {
			ReverseOrder.setValue(false);
		}

		await this.countAvailableQuestions();
		await this.calculateCountGoupedByErrorFrequency();
		//await //showAlert(JSON.stringify(this.getSelectedGroupErrorFrequency()), "info");
	},

	disableTopCountWrong: async () => {
		if (QuestionsWithError.isSwitchedOn && ReverseOrder.isSwitchedOn) {
			TopCountWrong.setValue(false);
		}

		await this.countAvailableQuestions();
	},

	selectExamSet: async () => {
		const selected = Number(ExamStyle.selectedOptionValue);
		//console.log("Exam style selected: ", selected);

		if (selected === 1) {
			await storeValue("myDomains", [
				{
					id: 1,
					label: "Domain 1 - Information Security Governance",
					checked: true,
					value: 18,
				},
				{
					id: 2,
					label: "Domain 2 - Information Security Risk Management",
					checked: true,
					value: 28,
				},
				{
					id: 3,
					label: "Domain 3 - Information Security Program Development and Management",
					checked: true,
					value: 33,
				},
				{
					id: 4,
					label: "Domain 4 - Information Security Incident Management",
					checked: true,
					value: 29,
				},
			]);
			await storeValue("defaultQuestionCount", 150, false);
			await storeValue("defaultTime", 240, false);
		} else if (selected === 2) {
			await storeValue("myDomains", [
				{
					id: 1,
					label: "Domain 1 - Information Security Governance",
					checked: true,
					value: 17,
				},
				{
					id: 2,
					label: "Domain 2 - Information Security Risk Management",
					checked: true,
					value: 20,
				},
				{
					id: 3,
					label: "Domain 3 - Information Security Program Development and Management",
					checked: true,
					value: 33,
				},
				{
					id: 4,
					label: "Domain 4 - Information Security Incident Management",
					checked: true,
					value: 30,
				},
			]);
			await storeValue("defaultQuestionCount", 150, false);
			await storeValue("defaultTime", 240, false);
		} else if (selected === 3) {
			await storeValue("myDomains", [
				{
					id: 1,
					label: "Domain 1 - Information Security Governance",
					checked: false,
					value: null,
				},
				{
					id: 2,
					label: "Domain 2 - Information Security Risk Management",
					checked: false,
					value: null,
				},
				{
					id: 3,
					label: "Domain 3 - Information Security Program Development and Management",
					checked: false,
					value: null,
				},
				{
					id: 4,
					label: "Domain 4 - Information Security Incident Management",
					checked: false,
					value: null,
				},
			]);
			await storeValue("defaultQuestionCount", 0, false);
			await storeValue("defaultTime", 0, false);
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

		//console.log(blockSettingQuestionsCount);

		const time = this.getTimeTotal();
		const timePerQuestion = appsmith.store.timePerQuestion;

		const numberQuestions = Math.floor(time / timePerQuestion);

		await storeValue("blockSettingQuestionsCount", true, false);

		CountQuestions.setValue(numberQuestions);
	},

	setTotalTime: async () => {
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

		//console.log(blockTimeSettings);

		const questionsCount = this.getCountQuestions();
		//console.log("questionsCount ", questionsCount, typeof questionsCount);
		const timePerQuestion = appsmith.store.timePerQuestion;
		//console.log("timePerQuestion ", timePerQuestion, typeof timePerQuestion);

		const timeTotal = Math.ceil(questionsCount * timePerQuestion);
		//console.log(timeTotal);

		TotalTime.setValue(timeTotal);
	},

	getSelectedTab: () => {
		if (Tabs.selectedTab === "Erweitert" && TopCountWrong.isSwitchedOn) {
			this.getSelectedGroupErrorFrequency();
		}
	},

	countAvailableQuestions: async (selectedDomainsWithValue) => {
		if (!selectedDomainsWithValue) {
			selectedDomainsWithValue = this.getSelectedDomains();
		}
		//console.log(selectedDomainsWithValue);

		// Sauberer Filter für die Domains
		const domains = selectedDomainsWithValue
		.map((domain) => (domain.checked ? domain.label : null))
		.filter(Boolean);

		const questionSets = this.getQuestionSet();
		const onlyCountWrong = QuestionsWithError.isSwitchedOn;

		// Query ausführen und Collection + Parameter übergeben
		const result = await AvailableQuestions.run({
			collection: this.getCollection(),
			domains: domains,
			origins: questionSets,
			onlyWrong: onlyCountWrong,
		});

		//console.log("Result ", result);

		// Korrektur von item.total auf item.totalCount
		const totalSum = (result || []).reduce((sum, item) => sum + (item.totalCount || 0), 0);
		console.log("Gesamtsumme aller Fragen: ", totalSum);

		await storeValue("questionsAvailable", totalSum, false);

		const countQuestions = this.getCountQuestions();

		if (totalSum < countQuestions) {
			CountQuestions.setValue(totalSum);
		}
	},

	calculateCountGoupedByErrorFrequency: async () => {
		const selecteDomainsWithValue = this.getSelectedDomains();
		const domains = selecteDomainsWithValue.map((domain) => domain.label);
		const onlyCountWrong = QuestionsWithError.isSwitchedOn;
		const questionSets = this.getQuestionSet();
		//const errorReverseOrder = ReverseOrder.isSwitchedOn;

		try {
			const result = await GroupedByErrorCount.run({
				collection: this.getCollection(),
				domains: domains,
				onlyWrong: onlyCountWrong,
				origins: questionSets,
			});

			await storeValue("groupedErrorFrequency", result, false);

			return result;
		} catch (e) {
			console.error("Fehler beim Abfragen der gruppierten Fehlerhäufigkeit!");
			return null;
		}
	},

	getErrorGroupedTestContent: async () => {
		console.log("===============> getErrorGroupedTestContent");
		////showAlert("===============> getErrorGroupedTestContent", "info");

		const countQuestions = this.getCountQuestions();
		const errorGroupsUnsorted = this.getSelectedGroupErrorFrequency();
		console.log(errorGroupsUnsorted);
		const errorGroups = errorGroupsUnsorted.reverse();
		console.log(errorGroups);

		const selectedDomains = this.getSelectedDomains();

		const domains = selectedDomains.map((domain) => ({
			domain: domain.label,
			percentage: Number(domain.value),
		}));

		const questionSets = this.getQuestionSet();

		// Fragen proportional auf Domains verteilen.
		// Restfragen werden anhand der größten Nachkommarestwerte verteilt.
		const allocateQuestions = (total, availableDomains) => {
			if (total <= 0 || availableDomains.length === 0) {
				return [];
			}

			const totalPercentage = availableDomains.reduce(
				(sum, domain) => sum + domain.percentage,
				0
			);

			if (totalPercentage <= 0) {
				return [];
			}

			const allocations = availableDomains.map((domain) => {
				const exactCount = (total * domain.percentage) / totalPercentage;

				return {
					...domain,
					count: Math.floor(exactCount),
					remainder: exactCount - Math.floor(exactCount),
				};
			});

			let remaining = total - allocations.reduce((sum, domain) => sum + domain.count, 0);

			allocations
				.sort((a, b) => b.remainder - a.remainder)
				.forEach((domain) => {
				if (remaining > 0) {
					domain.count++;
					remaining--;
				}
			});

			return allocations;
		};

		let excludeIds = [];
		let testQuestions = [];
		let remainingQstCnt = countQuestions;
		//console.log("Error groups: ", errorGroups);

		for (const errorGroup of errorGroups) {
			if (remainingQstCnt <= 0) break;

			const errorGroupQuestionCount = Number(errorGroup.questionCount);

			const neededQuestionCount = Math.min(remainingQstCnt, errorGroupQuestionCount);

			console.log(`========== ErrorGroup ${errorGroup.errorCount} ==========`);

			// Initiale Verteilung entsprechend der Domain-Prozentwerte
			const initialAllocation = allocateQuestions(neededQuestionCount, domains);

			console.log("Initial allocation:", initialAllocation);

			let groupQuestions = [];
			let exhaustedDomains = [];

			// --------------------------------------------------
			// 1. Durchlauf: ursprüngliche Prozentverteilung
			// --------------------------------------------------

			for (const allocation of initialAllocation) {
				if (allocation.count <= 0) continue;

				const qstParams = {
					domain: [allocation.domain],
					count: allocation.count,
					onlyWrong: true,
					errorGroup: errorGroup.errorCount,
					origins: questionSets,
					errorReverseOrder: false,
				};

				const loadedQuestions = await this.loadDomainQuestions(qstParams, excludeIds);

				const acceptedQuestions = loadedQuestions.slice(0, allocation.count);

				groupQuestions.push(...acceptedQuestions);

				// Domain als ausgeschöpft markieren, wenn sie weniger liefert
				if (acceptedQuestions.length < allocation.count) {
					exhaustedDomains.push(allocation.domain);
				}

				excludeIds = [
					...excludeIds,
					...acceptedQuestions.map((question) => question._id.toString()),
				];

				console.log(
					`Domain ${allocation.domain}: angefordert ${allocation.count}, geladen ${acceptedQuestions.length}`
				);
			}

			// --------------------------------------------------
			// 2. Durchlauf: Fehlende Fragen auf andere Domains
			// verteilen
			// --------------------------------------------------

			let missingQuestions = neededQuestionCount - groupQuestions.length;

			while (missingQuestions > 0) {
				const availableDomains = domains.filter(
					(domain) => !exhaustedDomains.includes(domain.domain)
				);

				if (availableDomains.length === 0) {
					console.log("Keine weiteren verfügbaren Domains.");
					break;
				}

				const fillAllocation = allocateQuestions(missingQuestions, availableDomains);

				console.log("Fill-up allocation:", fillAllocation);

				let questionsBeforeFillUp = groupQuestions.length;

				for (const allocation of fillAllocation) {
					if (allocation.count <= 0) continue;

					const qstParams = {
						domain: [allocation.domain],
						count: allocation.count,
						onlyWrong: true,
						errorGroup: errorGroup.errorCount,
						origins: questionSets,
						errorReverseOrder: false,
					};

					const loadedQuestions = await this.loadDomainQuestions(qstParams, excludeIds);

					const acceptedQuestions = loadedQuestions.slice(0, allocation.count);

					groupQuestions.push(...acceptedQuestions);

					excludeIds = [
						...excludeIds,
						...acceptedQuestions.map((question) => question._id.toString()),
					];

					// Domain liefert nicht mehr genügend Fragen
					if (acceptedQuestions.length < allocation.count) {
						exhaustedDomains.push(allocation.domain);
					}

					console.log(
						`Fill-up ${allocation.domain}: angefordert ${allocation.count}, geladen ${acceptedQuestions.length}`
					);
				}

				// Prüfen, ob überhaupt noch Fragen hinzugekommen sind
				if (groupQuestions.length === questionsBeforeFillUp) {
					console.log("Keine weiteren Fragen verfügbar.");
					break;
				}

				missingQuestions = neededQuestionCount - groupQuestions.length;

				console.log("Missing questions:", missingQuestions);
			}

			// Fragen der Fehlergruppe übernehmen
			testQuestions.push(...groupQuestions);

			remainingQstCnt = countQuestions - testQuestions.length;

			console.log(
				`ErrorGroup ${errorGroup.errorCount}: ${groupQuestions.length} Fragen übernommen.`
			);

			console.log("Remaining questions:", remainingQstCnt);
		}

		// --------------------------------------------------
		// Ergebnis
		// --------------------------------------------------

		console.log("Total test questions:", testQuestions.length);
		console.log("Target questions:", countQuestions);

		const domainsInQuestions = [];
		const countWrongInQuestions = [];

		testQuestions.forEach((question) => {
			domainsInQuestions.push(question.domain);
			countWrongInQuestions.push(question.countWrong);
		});

		// Tatsächliche Domain-Verteilung ausgeben
		const domainStatistics = {};

		testQuestions.forEach((question) => {
			domainStatistics[question.domain] = (domainStatistics[question.domain] || 0) + 1;
		});

		console.log("Tatsächliche Domain-Verteilung:", domainStatistics);

		return testQuestions;
	},

	getRegurlarTestContent: async () => {
		console.log("================> getRegularTestContent");

		const countQuestions = this.getCountQuestions();
		const selectedDomainsWithValue = this.getSelectedDomains();
		const onlyCountWrong = QuestionsWithError.isSwitchedOn;
		const errorReverseOrder = ReverseOrder.isSwitchedOn;
		const questionSets = this.getQuestionSet();

		const totalPercentageValue = Number(this.getTotalValue());

		if (totalPercentageValue > 100) {
			//showAlert("Inkorrekte Prozentwerte (>100 %), " + totalPercentageValue, "warning");
			return false;
		}

		if (totalPercentageValue < 100) {
			//showAlert("Inkorrekte Prozentwerte (<100 %), " + totalPercentageValue, "warning");
			return false;
		}

		if (!selectedDomainsWithValue.length) {
			//showAlert("Keine Domain ausgewählt!", "warning");
			return false;
		}

		// 1. Anzahl der Fragen anhand des Prozentanteils berechnen
		const domainConfig = selectedDomainsWithValue.map((domain) => {
			const percentage = Number(domain.value);
			const domainCount = Math.floor((countQuestions * percentage) / 100);

			console.log("Domain", domain.label, ":", domainCount, "(" + percentage + "%)");

			return {
				domain: [domain.label],
				percentage: percentage,
				count: domainCount,
			};
		});

		let testQuestions = [];
		let excludeIds = [];

		// 2. Ursprüngliche Fragen pro Domain laden
		for (const config of domainConfig) {
			if (config.count <= 0) {
				continue;
			}

			const domainQuestions = await this.loadDomainQuestions(
				{
					domain: config.domain,
					count: config.count,
					onlyWrong: onlyCountWrong,
					origins: questionSets,
					errorGroup: null,
					errorReverseOrder: errorReverseOrder,
				},
				excludeIds
			);

			testQuestions.push(...domainQuestions);

			excludeIds = testQuestions.map((question) => question._id.toString());

			console.log("Loaded", domainQuestions.length, "questions from", config.domain[0]);
		}

		console.log("Questions after first pass:", testQuestions.length);

		// 3. Fehlende Fragen proportional zu den Domain-Prozentanteilen auffüllen
		let remainingFillUp = countQuestions - testQuestions.length;

		while (remainingFillUp > 0) {
			const totalPercentage = domainConfig.reduce(
				(sum, config) => sum + config.percentage,
				0
			);

			// Proportionale Verteilung mit Abrundung
			const allocations = domainConfig.map((config) => {
				const exactCount = (remainingFillUp * config.percentage) / totalPercentage;

				return {
					config: config,
					count: Math.floor(exactCount),
					remainder: exactCount - Math.floor(exactCount),
				};
			});

			// Übrige Fragen anhand der größten Nachkommarestwerte verteilen
			let allocatedCount = allocations.reduce((sum, allocation) => sum + allocation.count, 0);

			const sortedAllocations = [...allocations].sort((a, b) => b.remainder - a.remainder);

			for (let i = 0; allocatedCount < remainingFillUp; i++) {
				sortedAllocations[i % sortedAllocations.length].count++;
				allocatedCount++;
			}

			let questionsAdded = 0;

			for (const allocation of allocations) {
				if (allocation.count <= 0) {
					continue;
				}

				const domainQuestions = await this.loadDomainQuestions(
					{
						domain: allocation.config.domain,
						count: allocation.count,
						onlyWrong: onlyCountWrong,
						origins: questionSets,
						errorGroup: null,
						errorReverseOrder: errorReverseOrder,
					},
					excludeIds
				);

				if (domainQuestions.length > 0) {
					testQuestions.push(...domainQuestions);
					questionsAdded += domainQuestions.length;

					excludeIds = testQuestions.map((question) => question._id.toString());
				}
			}

			console.log(
				"Fill-up added:",
				questionsAdded,
				"Remaining:",
				countQuestions - testQuestions.length
			);

			// Abbrechen, wenn keine weitere Frage verfügbar ist
			if (questionsAdded === 0) {
				break;
			}

			remainingFillUp = countQuestions - testQuestions.length;
		}

		// 4. Ergebnis kontrollieren
		console.log(
			"Final testQuestions length:",
			testQuestions.length,
			"(Target:",
			countQuestions,
			")"
		);

		console.log("All test questions:", testQuestions);

		const isUnique = {};

		testQuestions.forEach((question) => {
			isUnique[question.origin] = 1;
		});

		console.log("Origins: " + JSON.stringify(isUnique));

		// 5. Bookmarks und Usage aktualisieren
		testQuestions = await this.findBookmarks(testQuestions);
		await this.updateSelectedUsage(testQuestions);

		// 6. Fragen mischen
		const shuffleQuestions = (array) => {
			const arr = [...array];

			for (let i = arr.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[arr[i], arr[j]] = [arr[j], arr[i]];
			}

			return arr;
		};

		testQuestions = shuffleQuestions(testQuestions);

		console.log("Test questions:", testQuestions);

		return testQuestions;
	},

	calculateTestContent: async () => {
		const countQuestions = this.getCountQuestions();
		if (countQuestions <= 0) {
			//showAlert("Bitte wähle eine gewünschte Anzahl von Fragen!!", "error");
			return;
		}

		const title = this.getTitle();
		const time = this.getTimeTotal();
		const selectedDomainsWithalue = this.getSelectedDomains();
		const onlyCountWrong = QuestionsWithError.isSwitchedOn;
		let rawDomains = selectedDomainsWithalue.map((domain) => domain.label);
		const exampleSet = this.getSet();
		//showAlert("Gewähltes Set " + JSON.stringify(exampleSet), "info");
		//showAlert("TopCountWrong is: " + JSON.stringify(TopCountWrong.isSwitchedOn), "info");
		//showAlert("Auswertung " + JSON.stringify(typeof exampleSet), "info");
		//console.log(typeof exampleSet);
		console.log(typeof TopCountWrong.isSwitchedOn);

		let testQuestions =
				Number(exampleSet) === 3 && TopCountWrong.isSwitchedOn
		? await this.getErrorGroupedTestContent()
		: await this.getRegurlarTestContent();

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

		const totalQuestions = testQuestions.length;
		let allDomains = {};

		testQuestions.forEach((question) => {
			const domain = question.domain;

			allDomains[domain] = (allDomains[domain] || 0) + 1;
		});

		Object.keys(allDomains).forEach((domain) => {
			const count = allDomains[domain];

			allDomains[domain] = {
				count: count,
				percentage: Number(((count / totalQuestions) * 100).toFixed(2)),
			};
		});

		console.log("Enthaltene Domains:", allDomains);


		const allErrorGroups = testQuestions.map(question => (question.countWrong));
		const uniqueErrorGroups = [...new Set(allErrorGroups)];
		console.log("Enthaltene Fehlergruppen: ", uniqueErrorGroups);

		const uniqueIds = new Set(testQuestions.map(q => q._id));
		if (uniqueIds.size == testQuestions.length) {
			await showAlert("Unique "+ uniqueIds.size, "info");
		} else {
			await showAlert("Not unique " + uniqueIds.size, "info");
		}

		// Prepare test data
		await storeValue("title", title, false);
		await storeValue("nrquestions", parseInt(countQuestions), false);
		await storeValue("mins", parseInt(time), false);
		await storeValue("domains", rawDomains, false);

		await storeValue("currentQuestions", testQuestions, false);
		await storeValue("currentIndex", 0, false);

		if (!onlyCountWrong) {
			await storeValue("nature", "user");
		} else {
			await storeValue("nature", "ET");
		}
		
		const testBackup = appsmith.store.testBackup;
		if (typeof testBackup !== "undefined") {
			showModal(BackupDialog.name);
		}

		console.log("Nauture: ", appsmith.store.nature);

		await navigateTo("Execution", {}, "SAME_WINDOW");
	},

	// 2. Wird aufgerufen, wenn der Nutzer auf "OK" klickt
	onOkKlick: async () => {
		// Schließe das Modal zuerst
		closeModal(BackupDialog.name);

		const currentQuestions = appsmith.store.testBackup.currentQuestions;
		await storeValue("currentQuestions", currentQuestions, false);
		await storeValue("nrquestions", currentQuestions.length, false);
		console.log(currentQuestions);
		const currentIndex = appsmith.store.testBackup.currentIndex;
		await storeValue("currentIndex", currentIndex, false);
		console.log(currentIndex);
		const nature = appsmith.store.testBackup.nature;
		await storeValue("nature", nature);
		console.log(nature);
		const time = Math.ceil(Number(currentQuestions.length * 1.6));
		console.log(time);
		await storeValue("mins", parseInt(time), false);
	},
	
	  // 3. Wird aufgerufen, wenn der Nutzer auf "Cancel" klickt
  onCancelKlick: async () => {
    // Schließe das Modal
    closeModal(BackupDialog.name);
  },

	loadDomainQuestions: async (domains, excludeIds = []) => {
		const collection = this.getCollection();

		const params = {
			collection: collection,
			domain: domains.domain,
			questionLimit: domains.count,
			onlyWrong: domains.onlyWrong,
			excludeIds: excludeIds,
			origins: domains.origins,
			errorGroup: domains.errorGroup,
			errorReverseOrder: domains.errorReverseOrder,
		};

		const domainQuestions = await GetQuestions.run(params);

		return Array.isArray(domainQuestions) ? domainQuestions : [];
	},

	findBookmarks: async (questions) => {
		const allIds = questions.map((question) => question._id);
		const result = await GetBookmarks.run({
			ids: allIds,
		});

		const bookmarkedIds = new Set((result || []).map((b) => b.questionId));
		questions = questions.map((question) => {
			return {
				...question,
				hasBookmark: bookmarkedIds.has(question._id.toString()), // true, wenn ID in Bookmarks existiert, sonst false
			};
		});

		//console.log("Questions with bookmark field: ", questions);

		return questions;
	},

	updateSelectedUsage: async (questions) => {
		// 1. Berliner Zeit generieren
		const berlinTime = moment().tz("Europe/Berlin").format();

		console.log("Berlin time: ", berlinTime);
		console.log("Questions array: ", questions);

		const collectionArray = {};

		questions.forEach((question) => {
			const collection = question.origin;

			// HIER DIE KORREKTUR: Initialisieren, falls noch nicht vorhanden
			if (!collectionArray[collection]) {
				collectionArray[collection] = [];
			}

			if (typeof question._id == "string") {
				collectionArray[collection].push({ $oid: question._id });
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
				currentDate: berlinTime,
			});
		}
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
				await storeValue("testBackup", jsonObject, false);
				console.log("Test backup saved for use!!", jsonObject);
			}

		} catch (error) {
			showAlert("Fehler beim Parsen der JSON-Datei: " + error.message, "error");
		}
	}
};
