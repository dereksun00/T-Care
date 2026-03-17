# T-Care

T-Care is a hackathon-built University of Toronto campus support navigator. It helps students describe a need in plain language—such as losing a TCard, needing accessibility support, or looking for counselling—and routes them to the most relevant campus office, service, or resource.

This repository currently contains:
- an **Express backend** that resolves natural-language queries using **Amazon Bedrock**, with optional **Amazon Kendra** context
- a large **standalone landing page** in `index.html` that presents the hackathon demo experience
- a separate **React/Vite prototype** in `src/` for an accessibility-focused support flow backed by local matching data

> Winner @ UofT x AWS Hackathon

---

## What T-Care does

T-Care is designed around one core idea:

> Students usually know **what** they need, but not **where** to go.

Instead of making users search through multiple UofT pages, T-Care takes a natural-language request and turns it into either:
- a **specific campus destination** with an address, or
- a **plain-language answer** with relevant support links

Examples:
- “I lost my TCard”
- “I need extra time on my exams”
- “I need a counsellor”
- “I’m a trans student and need to update my name”
- “Where can I find accessible computers?”

---

## Current architecture

### 1. Express backend (`server.js`)
The backend exposes three API endpoints:

- `POST /api/resolve-location`  
  Resolves a natural-language query into a campus location or service.

- `GET /api/maps-key`  
  Returns the Google Maps API key to the frontend.

- `POST /api/chat`  
  Powers the T-Care assistant chat experience with Amazon Bedrock.

The resolution flow is:

1. Optionally query **Amazon Kendra** for matching UofT document context
2. Send the user query plus any Kendra context to **Amazon Bedrock**
3. Classify the request into a known campus service/location
4. Return a structured response for routing in the frontend

A keyword-based fallback is included so the UI still returns something even if Bedrock fails.

---

## Known campus services in the backend

The backend currently includes built-in mappings for services and destinations such as:

- Health & Wellness Centre
- Counselling
- TCard Office
- Registrar’s Office
- Accessibility Services
- Equity, Diversity & Inclusion Office
- Financial Aid & Awards
- Robarts Library
- Hart House
- Sidney Smith Hall
- Bahen Centre
- Medical Sciences Building
- Simcoe Hall

These are stored directly in `server.js` as known campus locations.

---

## Frontend paths in this repo

### A. Standalone hackathon demo (`index.html`)
The root `index.html` is a polished single-page demo site that includes:

- a hero section for natural-language campus support search
- an accessibility AI assistant
- a mental health section with crisis guidance
- an interactive campus routing section
- campus service cards
- a “how it works” explanation
- a contact/report-gap form

This appears to be the main presentation/demo surface for the hackathon version.

### B. React/Vite accessibility prototype (`src/`)
The `src/` folder contains a separate React app focused on accessibility support workflows.

It includes:
- `useMatchQuery.ts` for query state management
- `matcher.ts` for keyword + n-gram matching
- `resolver.ts` for turning a service match into either an info response or location response
- reusable UI components for query input, loading, info cards, location cards, and route cards
- local data files for services, locations, and routes

This React version currently models accessibility support only, with examples like:
- exam accommodations
- accessibility registration
- letters of accommodation
- note-taking support
- assistive technology
- assignment/test extensions
- accessible computer workstations
- interpreter services

---

## Local matching system in `src/`

The React prototype uses a lightweight local matcher instead of the Bedrock backend.

### Matching logic
`src/services/matcher.ts`:
- lowercases and tokenizes the query
- creates unigrams and bigrams
- scores each service based on keyword overlap
- falls back to a default accessibility service if confidence is too low

### Resolution logic
`src/services/resolver.ts`:
- returns an **info result** if a service is informational
- returns a **location result** if a service has an associated office and route
- degrades gracefully to an info-style answer if location or route data is missing

---

## Local data model in `src/data/`

The React prototype ships with local TypeScript data for:

- `accessibilityServices.ts` – accessibility-related services and FAQ-style answers
- `locations.ts` – physical offices such as Accessibility Services and the Robarts adaptive technology centre
- `routes.ts` – walking directions from Sidney Smith Hall to supported locations
- `categories.ts` – currently present but empty
- `mentalHealthServices.ts` – currently present but empty

So at the moment, the React prototype is primarily an **accessibility navigator MVP**, while the standalone `index.html` presents the broader T-Care vision.

---

## Tech stack

### Backend
- Node.js
- Express
- CORS
- dotenv
- AWS SDK
  - Amazon Bedrock Runtime
  - Amazon Kendra

### Frontend / UI
- Standalone HTML/CSS/JS demo in `index.html`
- React + TypeScript prototype in `src/`
- Vite config files are present for the React prototype

### External services
- Amazon Bedrock
- Amazon Kendra (optional)
- Google Maps API

---

## Project structure

```text
T-Care/
├── data/
│   └── logo.png
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   └── Header.tsx
│   │   ├── query/
│   │   │   ├── LoadingSpinner.tsx
│   │   │   └── QueryInput.tsx
│   │   └── result/
│   │       ├── InfoCard.tsx
│   │       ├── LocationCard.tsx
│   │       ├── ResultRouter.tsx
│   │       └── RouteCard.tsx
│   ├── data/
│   │   ├── accessibilityServices.ts
│   │   ├── categories.ts
│   │   ├── index.ts
│   │   ├── locations.ts
│   │   ├── mentalHealthServices.ts
│   │   └── routes.ts
│   ├── hooks/
│   │   └── useMatchQuery.ts
│   ├── pages/
│   │   └── HomePage.tsx
│   ├── services/
│   │   ├── matcher.ts
│   │   └── resolver.ts
│   ├── types/
│   │   ├── category.ts
│   │   ├── index.ts
│   │   ├── location.ts
│   │   ├── result.ts
│   │   └── service.ts
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   └── vite-env.d.ts
├── env.example
├── index.html
├── package.json
├── server.js
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
