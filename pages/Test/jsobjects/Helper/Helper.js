export default {
	testUnique: async() => {
			const testQuestions = appsmith.store.currentQuestions;
			const uniqueIds = new Set(testQuestions.map(q => q._id));
			if (uniqueIds.size == testQuestions.length) {
				console.log(uniqueIds);
				await showAlert("Unique "+ uniqueIds.size, "info");
			} else {
				await showAlert("Not unique " + uniqueIds.size, "info");
			} 
	}
}