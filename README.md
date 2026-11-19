Check out more details on DevPost: https://devpost.com/software/eno-2-0-the-future-of-banking-with-capital-one-0glkva

---

## Inspiration

Capital One's consumer app and website currently has Eno, a virtual assistant that leaves a bit to be desired. When we thought about what we could build for the future of banking, we wanted to be AI-first, with the whole experience built around chat. Eno 2.0 brought this vision to life for us.

With recent studies showing 2 in 3 consumers want their bank or financial institution to be more sustainable, we felt it was time your bank also used the trove of data it was sitting on to help you see and work on your carbon footprint. Building off of Capital One CreditWise, a tool for understanding your credit score, we built ClimateWise to tackle your carbon footprint.

## What it does

Eno 2.0 allows users to create a demo account and then talk with their bank, discovering insights that would otherwise be hard to decipher staring at a wall of transactions. This includes everything from a faster user onboarding to analysis of suspicious transactions, top spending categories, green spending, and more. Check out our [live demo](https://eno.mori.page) to see it in action!

## How we built it

We created an MCP for Capital One Nessie that interfaces with a Gemini-based chatbot that can tool call to read user information and create visual representations of insights based on their banking data. Our tech stack consists of Svelte, SvelteKit, ElevenLabs, Google Gemini, GoDaddy, MapBox and Cloudflare Workers. GoDaddy domains made it really easy to get a live demo up and running for anyone to view. ElevenLabs provides text-to-speech capabilities to improve accessibility. Finally, MapBox powers our inline map rendering for ATM locations in Eno.

## Challenges we ran into

Building out a powerful and hallucination free Eno was the biggest challenge throughout, making sure we provided proper context, pulled proper database records for issues, and guided the user through a friendly signup approach. Building a tight integration between our chat interface, dashboard transactions, and climate score also led to quite a few bugs that we had to sort out last minute in our QA evaluations.

## Accomplishments that we're proud of

We're proud of our clean UI and smooth transitions throughout the webpage along with having Eno be a helper of the future, integrated all the way from account creation to climate conscious advice. We made an experience that is accessible no matter where, when, and how you bank.

## What we learned

Throughout the 36 hour challenge, we learned to heavily scrutinize and test all parts of an MCP chat system to ensure quality for the user. We also learned how to optimize our GitHub contributions and branches to work effectively while rapidly developing a project as a team, even when working across an intertwined codebase. In the ideation process, we researched how various behaviors can have such outsized or unexpectedly small impacts on your climate footprint as a consumer.

## What's next

Eno 2.0 makes use of Capital One's Nessie, but that means it is all demo data. The next step from here would be to implement this type of chatbot with an integration that provides real user banking data, such as Plaid.
