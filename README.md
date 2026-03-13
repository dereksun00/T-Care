# HTSL 2026
Project Description
T-Care is a website application that uses LLMs to appropriately decide on the kind of health & wellness or accessibility assistance that you need. Depending on the user’s need, the website will redirect them to the appropriate page. For example, if the user is discussing anxiety and depression issues, the website will show links and resources that redirect the user to various UofT resources
	If a user requires immediate mental health & wellness assistance, the website will redirect them to UofT support helplines and services. If the user’s request is simple (provide tips on how to manage stress, etc.), the website will directly provide reasonable tips and strategies for the user to implement. This will utilize the AWS Amazon Kendra.
	If a user needs accessibility services, the website will properly redirect them to the appropriate accessibility service helpline.
	The application will also show a route to the closest immediate location of the accessibility service, which will be implemented by AWS Location Services. This function will be connected by Amazon Amplify, which sends the prompt to Kendra, receives a location and idea, and then prompts AWS Location Services to return a route.
Then, we will also condense and create compact texts by utilizing Amazon Bedrock and Lambda, which will take PDFs, read key information, and summarize it.
Overall, T-Care is a quick and fast way for students to find the support they need, and when they need it.
