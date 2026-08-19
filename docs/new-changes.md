Some issues and changes i want to report and want you you to do an audit and check if those are actual issue or improvement and create prompt to fix and improve it.

1. Loading of dashbaoard at the time of login is very slow, didn't get why it take this much time to fetch record there are not many in the database, same for server, connections, tools , we need to impove it 

2.what is this mode thing on the lef nav bar no use of it, need to remove it

3.Clicking manual connection on the connection page n file connection the app breaks

4. need to have an browse schma button the the card on the file connections like pick data base button on the filemaker connection on the connection screen

5.the tools generated at the time of the mcp server creation like add number , average , subtract and percentage need to be removed these are generat tools doesnot need to there in every mcp server, i will suggest to have these tools in the playground and only to be used there to give user a human readable response , like the total sales for this is year calcluate total from response ( sales ) and show to the user [ so these tool can be added to the playground (ai agent)]

6. on the mcp server detail screen we need to have a clear logic what these button represent edit, staging and deployed and have clear understanding how it affect the connections, brancheas and tools. having a clear idea is necessary any suggestion on implementing this

7. Editing servers, connection , mcp servers take a lot of time to load, did not understand why it is so slow need to improve the speed

8. On branch management we need to have a clear idea what functionality we need to provide how it will be going to operate on therms on pusing or pulling to different branches, how can create different configs based on the branch selected for testing, also merging branch colud have conflits so need a check to confirm changes , and if user wants ro revoke to the old changes in a particluar branch we need to prove logs to revoke back to that stage

9. on the playground screen on the server ai agents we need to improve the agent to give reponse in human readable language in sentences and paragraphs so that user can get the reponse properly

10. and now the most important thing is the tool creation what is the most important feature and everything depends on it. first, while manually creating tools, category needs to be properly defined whaich will be foundation of the mcp tool call, then on input the field name should be imported from the browse schema so that user can select it as a dropdown and no need to enter name , 
on the filemaker scripts, layout need to be fetched from the browse schema for the selected connections, multi table which is also an important part of the tool creation on complex query we need to use odata and data api to fetch record from different able so we have already reationship on the browse schema so we need to use that to do the connection for multi table, we need to make 
to just select from the dropdown and make him enter as less imformation possible to seamless create the tool and the test section also need to work to able to test the connetion if it works and based on the response we can selet what output to display this can have a section to select a paricular value from the json response or a list or a part of jaso which can help to consise the. response 
also do the same for the ai geneated tools and ai assitant for tool creation

11. on the deploy ment we have all the live config connection as we need two different conif for the test env and the live env so that we can work on this side by side and do not affect anything on the live 
making sure everyting works smoothly so that it can be deployed to production

thse are all the changes i want to implement few are issues and some are enhacement and need you be thorugh and deep check on each of the point and create sprint for me with the tasks and prompt so everyting can be seemless and no confusion and issue remaing while compeltin the task

