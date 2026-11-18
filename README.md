# Suresh-Political-Strategies
Its a new project 



How to Add More Villages Later
Drop the new village's JSON file into your data/ folder (e.g., data/venkatapuram.json).

Add <option value="Venkatapuram">Venkatapuram</option> to #villageSelect in index.html.

Add "Venkatapuram": "data/venkatapuram.json" to VILLAGE_JSON_MAP in voterscript.js. Firebase will automatically create the voter_directory_records/Venkatapuram node as soon as you verify or mark the first voter.