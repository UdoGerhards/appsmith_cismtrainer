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
		
		await FindAllReportsWeighted.run();

	},
getTestChartOptions: () => {
    // 1. Daten aus der Query holen
    const rawData = FindReports.data || [];

		// 2. Dokumente nach 'finsihed' AUFSTEIGEND (ältestes zuerst) sortieren
    const sortedDocs = [...rawData].sort((a, b) => {
      // Hilfsfunktion, um "DD.MM.YYYY HH:mm" in ein Date-Objekt umzuwandeln
      const parseDateStr = (dateStr) => {
        if (!dateStr) return 0;
        // Erwartet z.B. "05.09.2026 13:19"
        const [datePart, timePart] = dateStr.split(' ');
        const [day, month, year] = datePart.split('.');
        const [hour, minute] = timePart.split(':');
        // Monat ist in JS 0-basiert (0 = Januar, 8 = September)
        return new Date(year, month - 1, day, hour, minute).getTime();
      };

      return parseDateStr(a.finsihed) - parseDateStr(b.finsihed);
    });

    // Da sortedDocs jetzt schon AUFSTEIGEND ist (ältestes links), 
    // brauchen wir .reverse() hier NICHT mehr!
    const recentDocs = sortedDocs;

    // 3. Achsen- und Seriendaten vorbereiten
    const categories = recentDocs.map(doc => doc.finsihed || 'Test');
    
    // HIER DIE ANPASSUNG: Statt nur doc.correct ein Objekt mit value und id zurückgeben
    const correctData = recentDocs.map(doc => ({
      value: doc.correct,
      id: doc._id // <--- Wichtig für das onDataPointClick-Event
    }));

    const incorrectData = recentDocs.map(doc => ({
      value: doc.incorrect,
      id: doc._id // <--- Wichtig für das onDataPointClick-Event
    }));
    
    // Trenddaten ebenfalls mit ID versehen
    const trendData = recentDocs.map(doc => ({
      value: doc.correct,
      id: doc._id // <--- Wichtig für das onDataPointClick-Event
    }));

    // 4. Vollständige ECharts Konfiguration zurückgeben
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        }
      },
      legend: {
        data: ['Korrekt', 'Inkorrekt', 'Trend (Korrekt)'],
        bottom: 0
      },
      grid: {
        top: 30,
        bottom: 50,
        left: 40,
        right: 20,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: {
          interval: 0,
          rotate: 15,
          fontSize: 10
        }
      },
      yAxis: {
        type: 'value',
        name: 'Anzahl Fragen'
      },
      visualMap: {
        show: false,
        dimension: 1,
        seriesIndex: [2],
        pieces: [
          {
            lte: 3.5,
            color: 'rgba(239, 68, 68, 0.4)'
          },
          {
            gt: 3.5,
            lte: 5,
            color: 'rgba(34, 197, 94, 0.4)'
          }
        ]
      },
      series: [
        {
          name: 'Korrekt',
          type: 'bar',
          stack: 'total',
          data: correctData, // Nutzt jetzt das neue Objekt-Array
          itemStyle: {
            color: '#22c55e'
          },
          label: {
            show: true,
            position: 'inside'
          }
        },
        {
          name: 'Inkorrekt',
          type: 'bar',
          stack: 'total',
          data: incorrectData, // Nutzt jetzt das neue Objekt-Array
          itemStyle: {
            color: '#ef4444'
          },
          label: {
            show: true,
            position: 'inside'
          }
        },
        {
          name: 'Trend (Korrekt)',
          type: 'line',
          data: trendData, // Nutzt jetzt das neue Objekt-Array
          smooth: true,
          areaStyle: {
            opacity: 0.6
          },
          itemStyle: {
            color: '#1e40af'
          },
          lineStyle: {
            width: 3
          },
          symbol: 'circle',
          symbolSize: 8
        }
      ]
    };
  },
	
	// In deinem JSObject:
handleChartClick: async(clickedItem) => {
	
  // Die ID aus dem angeklickten Element auslesen
  const reportId = clickedItem?.rawEventData.data.id;
	
	showAlert(reportId);
	
		// 1. Führe den Query GetTest aus und warte auf das Ergebnis
		const result = await GetTest.run({
			"reportId": reportId
		});

		// 2. Überprüfe, ob ein Dokument gefunden wurde (result ist bei Find meist ein Array)
		if (result && result.length > 0) {
			const document = result[0];
			
			const selectedIds = document.questions.map(question => question._id);
			
			//console.log("IDS Array: ", selectedIds);
			
			await GetQuestions.run({ids: selectedIds});
			
			const questions = GetQuestions.data?.cursor?.firstBatch 
												|| GetQuestions.data 
												|| [];
			
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
		} else {
			showAlert("Dokument konnte nicht gefunden werden", "error");
		}
},

getDomainsWeighted: () => {
  const rawData = FindAllReportsWeighted.data;
  if (!rawData || !Array.isArray(rawData)) return [];

  return rawData.map(doc => {
    if (!doc.domain_stats || !Array.isArray(doc.domain_stats)) return doc;

    const sortedStats = [...doc.domain_stats].sort((a, b) => b.gewichtung - a.gewichtung);
    
    const associativeDomainStats = {};
    sortedStats.forEach(item => {
      associativeDomainStats[item.domain] = {
        correct: item.correct,
        incorrect: item.incorrect,
        gewichtung: item.gewichtung
      };
    });

    return {
      ...doc,
      domain_stats: associativeDomainStats
    };
  });
},

getChartOptions: (selectedReport) => {
  // WICHTIG: Ersetze 'NameDeinesJSObjekts' mit dem echten Namen deines Appsmith JS-Objekts
  const reports = this.getDomainsWeighted(); 
  
  const doc = selectedReport || (reports && reports.length > 0 ? reports[0] : null);

  if (!doc || !doc.domain_stats) {
    return {
      title: { text: 'Keine Daten verfügbar', left: 'center', top: 'center' }
    };
  }

  const domains = Object.keys(doc.domain_stats);
  if (domains.length === 0) {
    return {
      title: { text: 'Keine Domain-Daten vorhanden', left: 'center', top: 'center' }
    };
  }

  // 1. Berechnung der Gesamtsumme aller Gewichtungen
  const totalWeight = domains.reduce((sum, d) => sum + (doc.domain_stats[d].gewichtung || 0), 0);

  // 2. Umrechnung der einzelnen Gewichtungen in anteilsmäßige Prozentwerte
  const percentageLabels = domains.map(d => {
    const weight = doc.domain_stats[d].gewichtung || 0;
    const percentage = totalWeight > 0 ? (weight / totalWeight) * 100 : 0;
    return percentage.toFixed(2) + '%';
  });

  const correctData = domains.map(d => doc.domain_stats[d].correct || 0);
  const incorrectData = domains.map(d => doc.domain_stats[d].incorrect || 0);
  
  const barLabelData = domains.map(d => {
    return {
      value: (doc.domain_stats[d].correct || 0) + (doc.domain_stats[d].incorrect || 0),
      domainName: d
    };
  });

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: function(params) {
        if (!params || params.length === 0) return '';
        
        const index = params[0].dataIndex;
        const labelSerie = params.find(p => p.seriesName === 'DomainLabel');
        const domainName = labelSerie && labelSerie.data ? labelSerie.data.domainName : 'Unbekannt';
        
        // Holt den berechneten Prozentwert für den Tooltip
        const currentPercentage = percentageLabels[index];

        let res = `<b>${domainName}</b><br/>Anteil: ${currentPercentage}<br/>`;
        params.forEach(item => {
          if (item.seriesName !== 'DomainLabel') {
            const val = typeof item.value === 'object' ? item.value.value : item.value;
            res += `${item.marker} ${item.seriesName}: ${val}<br/>`;
          }
        });
        return res;
      }
    },
    legend: {
      data: ['Korrekt', 'Inkorrekt'],
      top: 10
    },
    grid: {
      top: 100, 
      bottom: 60,
      left: 50,
      right: 30
    },
    xAxis: {
      type: 'category',
      data: percentageLabels, // Zeigt jetzt die Prozentwerte auf der X-Achse
      name: 'Anteil an Gesamtgewichtung',
      nameLocation: 'middle',
      nameGap: 35,
      axisLabel: {
        interval: 0,
        fontWeight: 'bold'
      }
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        name: 'Korrekt',
        type: 'bar',
        stack: 'total',
        itemStyle: { color: '#22c55e' },
        label: {
          show: true,
          position: 'inside',
          formatter: (params) => params.value > 0 ? params.value : ''
        },
        data: correctData
      },
      {
        name: 'Inkorrekt',
        type: 'bar',
        stack: 'total',
        itemStyle: { color: '#ef4444' },
        label: {
          show: true,
          position: 'inside',
          formatter: (params) => params.value > 0 ? params.value : ''
        },
        data: incorrectData
      },
      {
        name: 'DomainLabel',
        type: 'bar',
        barGap: '-100%', 
        itemStyle: {
          color: 'rgba(0, 0, 0, 0)', 
          borderColor: 'rgba(0, 0, 0, 0)' 
        },
        silent: true, 
        label: {
          show: true,
          position: 'top', 
          distance: 8,
          formatter: (params) => params.data.domainName,
          fontWeight: 'bold',
          color: '#1f2937',
          fontSize: 11
        },
        data: barLabelData
      }
    ]
  };
},
	
	getDomain1: () => {
		const dom = 'Domain 1 – Information Security Governance';
		return this.getDomainChartOptions(dom);
	},
	
	getDomain2: () => {
		const dom = 'Domain 2 – Information Risk Management';
		return this.getDomainChartOptions(dom);
	},
	
	getDomain3: () => {
		const dom = 'Domain 3 – Information Security Program Development and Management';
		return this.getDomainChartOptions(dom);
	},
	
	getDomain4: () => {
		const dom = 'Domain 4 – Information Security Incident Management';
		return this.getDomainChartOptions(dom);
	},
	
	getDomainChartOptions: (dom) => {
    // 1. Alle Dokumente holen
    const allReports = FindAllReports.data || [];
    
    // 2. Alle Fragen aus allen Berichten in ein flaches Array extrahieren
    const allQuestions = allReports.flatMap(report => report.questions || []);
    
    // 3. Nur Fragen der Domain 1 filtern
    const domain1Questions = allQuestions.filter(q => 
      q.domain === dom
    );
    
    // 4. Statistik für Domain 1 berechnen
    const correctCount = domain1Questions.filter(q => q.isCorrect === true).length;
    const incorrectCount = domain1Questions.filter(q => q.isCorrect === false).length;

    // 5. Konfiguration für das EChart
    return {
      title: {
        text: dom,
        left: 'center'
      },
      tooltip: {
        trigger: 'item'
      },
      legend: {
        bottom: 0
      },
      series: [
        {
          name: 'Antworten',
          type: 'pie', // Ein Kreisdiagramm eignet sich hier oft besser zur Verteilung
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          data: [
            { value: correctCount, name: 'Korrekt', itemStyle: { color: '#22c55e' } },
            { value: incorrectCount, name: 'Inkorrekt', itemStyle: { color: '#ef4444' } }
          ],
          label: {
            show: true,
            formatter: '{b}: {c}'
          }
        }
      ]
    };
  },
	
	getFormattedWrongQuestions: () => {
        const rawData = GetWrongAnswersSorted.data || [];
		    const rawBookmarks = Bookmarks.data || [];
		    const rawComments = Comments.data  || [];
		
        return rawData.map(item => {
            const answersList = item.answers || [];

            // Hilfsfunktion, um den Text einer bestimmten Antwort (A, B, C oder D) zu finden
            const getAnswerText = (type) => {
                const found = answersList.find(ans => ans.type === type);
                return found ? found.text : '';
            };
			
					  const correctAnswer = getAnswerText(item.correctAnswer);
					
						const hasBookmark = rawBookmarks.some(bookmark => bookmark.questionId === item._id);
					  let bookmark = null;
						if (hasBookmark) {
							bookmark = '!!!';
						}
					
						// 1. Das passende Objekt finden
						const foundComment = rawComments.find(item => item.questionId === item._id);
						// 2. Den "comment"-Parameter auslesen (liefert den Text oder undefined)
					  let comment = '';
						if (foundComment){
							comment = foundComment?.comment;
						}
            return {
                "Anzahl falsch": item.failureCount,
                "Domain": item.domain,
                "Frage": item.question,
                // Jede Antwort bekommt nun ihr eigenes Feld für eine eigene Spalte
                "Antwort A": getAnswerText('A'),
                "Antwort B": getAnswerText('B'),
                "Antwort C": getAnswerText('C'),
                "Antwort D": getAnswerText('D'),
								"id": item._id,
							  "Korrekte Antwort": correctAnswer,
							  "Bbookmark": bookmark,
								"Comments": comment
            };
        });
    },
	
explainQuestion: async (id, questionText, userAnswer, correctAnswer) => {
	
	console.log("GEMINI start");
	console.log(id);
	console.log(questionText);
	console.log(correctAnswer);
	
	
		// Sicherheits-Check: Wenn keine ID da ist, gar nicht erst die Query ausführen!
		if (!id) {
			console.error("Abgebrochen: Keine ID übergeben!", { id, questionText });
			await storeValue('aiResult', "Fehler: Keine gültige Frage-ID übergeben.");
			return;
		}

		console.log("Explanation process running for ID:", id);
		
		// 1. Zuerst im Cache suchen
		console.log("Mongo lookup ...");
		
		const cachedEntry = await FindAICache.run({ id: id });

		if (cachedEntry && cachedEntry.length > 0) {
			console.log("Aus Cache geladen:", cachedEntry[0].explanation);
			await storeValue('aiResult', cachedEntry[0].explanation);
			return cachedEntry[0].explanation;
		}
		
		console.log("Gemini lookup ...");

		// 2. Falls nichts gefunden: Gemini abfragen
const prompt = `
				You are a CISM examiner. Analyze the following question details.

				Question: ${questionText}
				User's Answer: ${userAnswer}
				Correct Answer: ${correctAnswer}

				Provide a brief and precise explanation in English. You must cover three aspects:
				1. The question
				2. Explain why the Correct Answer is factually and professionally correct based on CISM standards.
				3. Evaluate the User's Answer. State clearly if it is correct or incorrect. If it is incorrect, explain the technical misconception or why it is less suitable than the correct choice.

				HTML OUTPUT TEMPLATE (You must strictly follow this structure):
				<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
					<h2><b>Question:</b> ${questionText}</h2>
					<span id="question">Your detailed analysis of the question here...</span>
					
					<p><b>Correct Answer </b>(${correctAnswer}):</p>
					<span id="correct">Your explanation why this answer is correct based on CISM standards...</span>
					
					<p><b>User's Answer </b>(${userAnswer}):</p>
					<span id="user">Your evaluation of the user's answer (correct/incorrect and why)...</span>
				</div>

				CRITICAL RULES:
				1. Write the entire response in English.
				2. Always include the exact question, correct answer text, and user answer text as shown in the template before each explanation section.
				3. If the user's answer is not given, skip the user evaluation section completely.
				4. Do NOT include any introductory, conversational, or filler phrases. Start immediately with the HTML structure.
				5. Format the output using standard HTML tags only (e.g., <b>, <p>, <ul>/<li>, <br>). 
				6. Do NOT use any Markdown formatting like asterisks (**) or hashtags (#).
				7. Make sure every inner span (id="question", id="correct", id="user") and the outer div is properly opened and closed.
			`;
		await storeValue('geminiPrompt', prompt);

		try {
			const response = await Gemini_Explain_API.run();
			const parts = response.candidates[0].content.parts;
			
			let fullExplanation = "";
			if (Array.isArray(parts)) {
					fullExplanation = parts.map(p => p.text).join('');
			}
			
			console.log("Full Explanation", fullExplanation);

			// Extrahiere gezielt den Inhalt von id="question" und id="correct" mittels RegEx
			const questionMatch = fullExplanation.match(/<span[^>]*id="question"[^>]*>([\s\S]*?)<\/span>/i);
			const correctMatch = fullExplanation.match(/<span[^>]*id="correct"[^>]*>([\s\S]*?)<\/span>/i);

			const extractedQuestion = questionMatch ? questionMatch[1] : "";
			const extractedCorrect = correctMatch ? correctMatch[1] : "";
			
			// 3. Nur Frage und korrekte Antwort mit sauberer HTML-Formatierung zusammenbauen
			const customFormattedExplanation = `
				<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
					<p><b>Question:</b> ${questionText}</p>
					<span>${extractedQuestion}</span>
					
					<p><b>Correct Answer (${correctAnswer}):</b></p>
					<span>${extractedCorrect}</span>
				</div>
			`.trim();

			// 3. Nur die extrahierten Teile in der Datenbank speichern
			const docToInsert = {
				questionID: { "$oid": id },
				explanation: (customFormattedExplanation)
			};

			await InsertAICache.run({ doc: docToInsert });
			console.log("Store restricted result in Mongo ...", docToInsert);
			
			// Im Modal zeigen wir weiterhin die volle Antwort an
			await storeValue('aiResult', fullExplanation);
			console.log("Neue Erklärung gespeichert.");

			return fullExplanation;
		} catch (error) {
			console.error("Fehler bei Gemini:", error);
			await storeValue('aiResult', "Fehler: Die Erklärung konnte nicht geladen werden.");
			return null;
		}
	},
}