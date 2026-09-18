export default {
  resetAll: async () => {
    // Löscht den gesamten Appsmith-Store
    await clearStore();

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
    await GetDomain.run();

    const domainConfig = {
      "Domain 1 – Information Security Governance": 24,
      "Domain 2 – Information Risk Management": 34,
      "Domain 3 – Information Security Program Development and Management": 25,
      "Domain 4 – Information Security Incident Management": 17
    }

    await storeValue("domainConfig", domainConfig, false);

    await this.initDomainStore(); // Mieser hack Alter

    this.proceedStep1();
  },
	
	handleLimitToError: async() => {
		if (LimitQuestions.isSwitchedOn && (QuestionsWithError.isSwitchedOn || BookmarksOnly.isSwitchedOn) ) {
				    this.proceedStep1();
		}
	},

  // 1. Diese Funktion bindest du an dein List-Widget: {{JSObject1.getDomains()}}
  getDomains: () => {
    const rawData = GetDomain.data;
    const domainConfig = appsmith.store.domainConfig || {};

    let rawItems = [];
    if (Array.isArray(rawData)) {
      rawItems = rawData;
    } else if (rawData?.cursor?.firstBatch && Array.isArray(rawData.cursor.firstBatch)) {
      rawItems = rawData.cursor.firstBatch;
    }

    // Daten ohne Seiteneffekte für das Widget aufbereiten
    let items = rawItems.map((value, idx) => ({
      id: idx,
      text: value._id,
      percentage: Number.isFinite(domainConfig[value._id]) ? domainConfig[value._id] : ""
    }));

    // Alphabetisch sortieren
    items.sort((a, b) => a.text.localeCompare(b.text, 'de', { sensitivity: 'base' }));

    return items;
  },

  // 2. Diese Funktion rufst du einmalig auf (z.B. im "onPageLoad" der Seite oder in "resetAll")
  initDomainStore: async () => {
    const items = this.getDomains(); // Holt sich die sortierten Daten von oben
    const nextStoreUpdate = { ...(appsmith.store.domainPercentages || {}) };

    items.forEach((item) => {
      if (item.percentage !== "") {
        nextStoreUpdate[item.id] = Number(item.percentage);
      }
    });

    await storeValue('domainPercentages', nextStoreUpdate, false);

    console.log("nextStoreUpdate", nextStoreUpdate);
  },

  savePercentage: async(domainItem, percent) => {
		
		if (!percent || percent.trim() == "") {
			const domainDefault = appsmith.store.domainConfig;
			percent = Number(domainDefault[domainItem.text]);
		}
		
		console.log("Domain Item ", domainItem);
		console.log("Percentage: ", percent);
		
    // Falls das Item ein Objekt ist (z.B. aus der DB), _id nutzen, sonst den String direkt
    const key = (typeof domainItem === 'object' && domainItem !== null) ? domainItem.id : domainItem;

    //console.log("Domain item ", domainItem);
    //console.log("Percent: ", percent);

    const currentStore = appsmith.store.domainPercentages || {};

    await storeValue('domainPercentages', {
      ...currentStore,
      [key]: Number(percent) || 0
    });

    //console.log("Store: ", appsmith.store.domainPercentages);
  },

  processPercentages: async() => {
    const userPercentages = appsmith.store.domainPercentages;

    console.log("userPercentages: ", userPercentages)

    const allDomains = this.getDomains();

    if (!userPercentages || !allDomains) return [];

    const numberOfQuestions = Number(appsmith.store.nrquestions) || 0;
    if (numberOfQuestions === 0) return [];

    let currentTotal = 0;

    // 1. Schritt: Exakte Raten berechnen und den abgerundeten Anteil vergeben
    const questionRatePerDomain = allDomains.map((domain, index) => {
      const percentage = userPercentages[index] || 0;
      const exactRate = (numberOfQuestions * percentage) / 100;
      const baseQuestions = Math.floor(exactRate); // Nur ganze Fragen

      currentTotal += baseQuestions;

      return {
        idx: index,
        domain: domain.text,
        percentage: percentage,
        nrQuestions: baseQuestions,
        remainder: exactRate - baseQuestions // Die Nachkommastelle für später merken
      };
    });

    // 2. Schritt: Wie viele Fragen fehlen noch bis zur Gesamtsumme?
    let missingQuestions = numberOfQuestions - currentTotal;

    // 3. Schritt: Sortiere die Domains nach dem größten Rest (Nachkommastelle) absteigend
    // Bei Gleichstand entscheidet der höhere Prozentsatz
    const sortedByRemainder = [...questionRatePerDomain].sort((a, b) => {
      if (b.remainder === a.remainder) {
        return b.percentage - a.percentage;
      }
      return b.remainder - a.remainder;
    });

    // 4. Schritt: Fehlende Fragen einzeln an die Domains mit den größten Resten verteilen
    for (let i = 0; i < missingQuestions; i++) {
      // Nutze Modulo %, falls mehr Fragen übrig sind als Domains existieren
      const domainToUpgrade = sortedByRemainder[i % sortedByRemainder.length];

      // Finde das Original-Objekt im Berechnungs-Array und erhöhe um 1
      const originalObj = questionRatePerDomain.find(obj => obj.idx === domainToUpgrade.idx);
      if (originalObj) {
        originalObj.nrQuestions += 1;
      }
    }

    // 5. Schritt: Das "remainder"-Hilfsfeld entfernen, damit die Daten sauber sind
    const aktualisiertesArray = questionRatePerDomain.map(({ remainder, ...cleanObj }) => cleanObj);

    console.log("Gerecht verteilte Questions per Domain: ", aktualisiertesArray);

    // Validierung in der Konsole, ob die Summe exakt stimmt
    const finalSum = aktualisiertesArray.reduce((sum, d) => sum + d.nrQuestions, 0);
    console.log("Gesamtsumme kontrolliert: ", finalSum);

    //await storeValue("domains", aktualisiertesArray, false);

    return aktualisiertesArray;
  },
	
  saveValues: async () => {
    await storeValue('title', Input1.text, false);
    await storeValue('nrquestions', parseInt(Input2.text), false);
    await storeValue('mins', parseInt(Input3.text), false);
    await storeValue('nature', 'user');
  },

  loadTest: async() => {

    const questionsPerDomain = await this.processPercentages();
		
		//wait showAlert(limitedquestions);

    await storeValue('domains', questionsPerDomain, false);

    let questions = [];

    console.log("Questions per Domain: ", questionsPerDomain);

    // 1. Fragen aus den Domains sammeln
    for (const domain of questionsPerDomain) {
      //console.log("Domain-Objekt: ", domain);
      //console.log("Domain:", domain.domain);
      //console.log("Percentage: ",domain.percentage);
      //console.log("Anzahl Fragen: ", domain.nrQuestions);
			
			if (appsmith.store.countPerMinUsage !== undefined && appsmith.store.countPerMinUsage !== null) {
				//const domainMin = this.getDomainMinUsage(domain.domain);
				const minOccure = await this.getDomainMinUsage2(domain.domain, domain.nrQuestions);
				domain.minOccure = minOccure;
				//domain.nrQuestions = Number(domainMin);
			} else {
				domain.minOccure = Number(Custom1.model.value) || 0;
			}

      //let domainQuestions = [];

			console.log("Domain ", domain);
      const domainQuestions = await GetQuestions.run({ domain: domain.domain, questionLimit: domain.nrQuestions, minOccure: domain.minOccure  });

      console.log("Domain Fragen-Array: ", domainQuestions);

      questions = [...questions, ...domainQuestions];
    }

    console.log("Alle Fragen nach Domains: ", questions);

    // 2. Das gesammelte Array shuffeln (Fisher-Yates)
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      // Elemente im Array tauschen
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }

    console.log("Gemischte Questions: ", questions);

    // 3. Im Appsmith Store speichern
    await storeValue("currentQuestions", questions);

    if (appsmith.store.currentIndex === undefined) {
      await storeValue("currentIndex", 0);
    }
  },
	
	loadLimitedTest: async() => {
		const limit = Number(Input2.text);
		const domain = "";
		const questions = await this.getLimitedQuestions(domain, limit);
		
		await storeValue("currentQuestions", questions);
		
	},

  // Funktion zum Abrufen UND Zufallsmischen der Fragen
  getLimitedQuestions: async (domain, limit) => {
    // 1. Pipeline ausführen und alle passenden Fragen holen
    const pipeline = this.getPipeline(domain,limit);
		
		console.log("limited pipeline", pipeline);

    // Führe die MongoDB Query aus (passe den Namen deiner Query hier an!)
    const response = await GetLimitedQuestions.run({ customPipeline: pipeline });
    // Hinweis: Falls deine Query die Pipeline direkt über das JSObject holt,
    // reicht oft auch einfach ein await QueryGetFilteredQuestions.run();

    const allQuestions = GetLimitedQuestions.data || [];
		
		console.log("length ", allQuestions.length);
		
    const l = parseInt(limit) || allQuestions.length;

    // 2. Fisher-Yates Shuffle Algorithmus (perfektes Mischen)
    let shuffled = [...allQuestions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // 3. Auf die gewünschte Anzahl begrenzen
    return shuffled.slice(0, l);
  },

  getPipeline: (domain, limit) => {
    const limitCount = parseInt(limit) || 0;
    const showIncorrect = QuestionsWithError.isSwitchedOn;
    const showBookmark = BookmarksOnly.isSwitchedOn;

    // Pipeline startet mit dem Aufbrechen des Fragen-Arrays
    const pipeline = [
      { $unwind: "$questions" }
    ];

    // 1. DOMAIN FILTER: Nur Fragen der gesuchten Domain berücksichtigen
    if (domain) {
      pipeline.push({
        $match: {
          "questions.domain": domain
        }
      });
    }

    // 2. STATUS FILTER (Falsche Fragen / Bookmarks)
    let orConditions = [];
    if (showIncorrect) {
      orConditions.push(
        { "questions.isCorrect": false }
      );
    }
    if (showBookmark) {
      orConditions.push({ "questions.bookmark": true });
    }

    if (orConditions.length > 0) {
      pipeline.push({ $match: { $or: orConditions } });
    }

    // 3. DUBLETTEN ENTFERNEN & DOKUMENT-STRUKTUR WIEDERHERSTELLEN
    pipeline.push(
      {
        $group: {
          _id: "$questions.ID",
          frageDetails: { $first: "$questions" }
        }
      },
      { $replaceRoot: { newRoot: "$frageDetails" } }
    );

    // 4. LIMIT ANWENDEN: Begrenzt die Anzahl der eindeutigen Fragen
    if (limitCount > 0) {
      pipeline.push({
        $limit: limitCount
      });
    }

    return pipeline;
  },


  // Hilfsfunktion zum Starten der Abfrage aus JS heraus
  runQuery: async () => {
    return await GetLimitedQuestions.run();
  },

  goTo: async(page) => {
    console.log(page);
    navigateTo(page, {}, 'SAME_WINDOW');
  },
  proceedStep1: async() => {
		const limitedquestions =  LimitQuestions.isSwitchedOn;
		
    removeValue("buttonLabel");
    removeValue("buttonLabelIcon");
		removeValue("moveToNextPage");
		
    await this.saveValues();
    await storeValue('customNumValue', Number(Custom1.model.value));

    console.log(appsmith.store.title);
    console.log(appsmith.store.nrquestions);
    console.log(appsmith.store.mins);
    console.log(appsmith.store.domains);
    console.log("limited questions", appsmith.store.limitedquestions);

		if (!limitedquestions) {
    		await this.loadTest();
			} else {
				await this.loadLimitedTest();
			}

    const currQuestions = appsmith.store.currentQuestions;
    const currQuestionsCount = appsmith.store.currentQuestions.length;
    const questionCountReq = appsmith.store.nrquestions;

    await storeValue("buttonLabel", Number(currQuestionsCount) +  "/"+questionCountReq, false);

    console.log("currQuestions", currQuestions);
    console.log("currQuestionsCount", currQuestionsCount);
    console.log("questionCountReq", questionCountReq);
    console.log("Value custom widget: ", Number(Custom1.model.value))

    await removeValue("moveToNextPage");
    if (currQuestionsCount === questionCountReq) {
      await storeValue("buttonLabelIcon", true, false);
      await storeValue("moveToNextPage", true, false);
    } else {
      await storeValue("buttonLabelIcon", false, false);
    }
  },

  proceedStep2: async() => {
    await this.goTo("Execution");
  },

  handleSwitchChange: async() => {
    if (Switch2.isSwitchedOn && Number.isNaN(Custom1.model.value)) {
      // 1. Wert sicher im Store auf 0 setzen
      await storeValue('customNumValue', 0);
    } 
		
		if (Switch2.isSwitchedOn) {
			await storeValue("perDomainSwitch", "Per domain", false);
		  await storeValue("countPerMinUsage", true, false);
		}else {
			removeValue("countPerMinUsage");
		}

    // 2. Deine eigentliche Folgemaßnahme aufrufen
    await ConfigSource.proceedStep1();
  },
	
	handlePerDomainClick: async() => {
		const handlePerDomain = appsmith.store.countPerMinUsage;
		
		if (handlePerDomain) {
			removeValue("countPerMinUsage");
		} else {
			await storeValue("countPerMinUsage", true, false);		
		}
		
		await this.proceedStep1();
	},
	
	// Min usage
	getDomainMinUsage: async (domain) => {
    try {
      // Query ausführen und auf das Ergebnis warten
      const data = await DomainMinUsage.run({ domain: domain });
      
      // Die Zahl des geringsten Vorkommens herausziehen
      const minUsage = data?.[0]?.minUsage ?? 0;
			
			console.log("minUsage: ", minUsage);
      
      console.log("Minimaler Usage Count:", minUsage);
      return minUsage;
    } catch (error) {
      console.error("Fehler beim Ausführen der Query:", error);
      return 0;
    }
  },
	
	getDomainMinUsage2: async (domain, minQuestionCount) => {
    try {
      // Query ausführen und auf das Ergebnis warten
      const res = await DomainMinUsage2.run({ domain: domain });
			
			let data = null;
		
			// Prüfen, ob das Ergebnis existiert und das Array zurückgeben
      if (res && res.length > 0 && res[0].result) {
        data =  res[0].result;
				
				let idx = 0;
				let overAllCounter = 0;
			
				for (const cnt of data) {
					//const res = await GetNumberOfDomainQuestions.run({domain: domain, countBorder: idx});
					//console.log("Res ", res);
					let questionCount = 0;
					//if (res && res.length > 0 && res[0].totalCount !== undefined) {
					questionCount = res[0].totalCount;
					overAllCounter +=cnt;
					console.log("questionCount ", questionCount);
					if (overAllCounter >= minQuestionCount) {
							console.log("-------------------------------------------------------------------");	
							console.log("Ausstieg bei idx ", idx);
							console.log(domain, minQuestionCount, overAllCounter, idx);
							console.log("-------------------------------------------------------------------");	
							break;
						} else {
							idx ++;
						}
					 //}
			}
      
      // Beispiel-Logik:
      return idx;
			} else  {
				return 0;
			}
    } catch (error) {
      showAlert("Fehler: " + error.message);
      return [];
    }
	}
}
