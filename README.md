# Finance Records

A local app for recording accounts, income, expenses, transfers, credit-card statements, and investments. Version 1.2.0.

[Open the tool](https://bidagu.github.io/finRecords/) · [简体中文](README.zh-CN.md)

## Get started

1. Open the tool with the above link or download `Finance Records.html` or `index.html` from the repository. Both contain the same app.
2. If using the local version, open the downloaded `Finance Records.html` or `index.html` file in a modern browser. No installation is required.
3. Choose **English** or **简体中文** in the header. Start with **New file** and select USD or RMB, or use **Open JSON** to reopen a saved file. The file keeps its currency when the language changes.
4. In **Accounts & Assets**, add your accounts. Accounts start at zero; record the activity that explains their balances.
5. In **Income & Expenses**, create categories and add entries. Use **Transfers** to move money between accounts, including credit-card repayments.

To try the app, download the [USD example JSON](https://github.com/BidaGu/finRecords/blob/HEAD/examples/demo-recording-3-years-800.json) or [RMB example JSON](https://github.com/BidaGu/finRecords/blob/HEAD/examples/demo-recording-cny.json), then choose **Open JSON**. Both contain fictional data.

Money values have no currency prefix. Titles, form labels, table headings and charts show **USD** or **CNY**; exact amounts retain grouping and two decimal places.

Each file uses one currency for all accounts. Existing USD JSON files remain supported with format version 1.0.0; switching language does not convert money. Finish any open dialog or file operation before changing language.

Activity dates describe when income or expenses happened. Posting dates determine account balances. Credit-card purchases are Expenses while repayments are Transfers.

## Save your records

Choose **Save** to save your records as JSON. Keep that file and a backup in a private location, and use **Open JSON** to continue later.

Saving an entry updates the open app. Save the JSON file before closing or reloading. There is no automatic saving. If the app shows **Copy downloaded**, check that the JSON copy was downloaded successfully.

Your financial data stays separate from the app. CSV exports are for spreadsheet review. JSON retains the complete editable records.

Under **Analysis**, use **Accounts & Assets** to choose accounts and a posting cutoff. Assets and Liabilities each show up to 12 available monthly snapshots above a matching pie and ranked type table. Use **Top types shown** for both pies and ranked tables; expand a full table for all types. The columns stack on narrow screens. Investments use recorded cash and holdings at purchase cost.

For income and expenses, check the **Analyze** entries in the main **Income & Expenses** workspace, then open **Analysis → Income & Expenses** and choose an activity-date range. Reports show totals, monthly activity, and income/expense category pies. **Top categories shown** controls ranked breakdowns; expand **All income categories** or **All expense categories** for the complete selected/in-range list. Scroll the monthly chart horizontally to reach the full range, and expand **Monthly income and expense values** for the exact table. Reports do not change your records.

Under **Calculators**, use the **Calculator** chooser: **Growth → Compound Growth** for pre-tax hypothetical growth, **Stocks → Average Cost** to find shares for a target average or the resulting average from an entered purchase quantity, or **Stocks → Sale Gain/Loss** for a manual partial/full sale across lots with one whole-sale fee. For Sale Gain/Loss, enter lots in the compact editor, then the common price/fees below it. Each calculator has an independent currency choice, initially USD. Changing that choice keeps input numbers and requires Calculate again; it does not convert currencies. Enter scenario values manually. The calculators keep separate forms, need no financial file, and do not change your records. Working scenarios are temporary and never part of financial JSON. Save one input preset per calculator in this browser, Load it to refill inputs and Calculate again, or use Export/Import presets for a separate portable backup. New/Open and Reset keep saved presets.
