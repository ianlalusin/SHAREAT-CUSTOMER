# **App Name**: SharEat Customer Hub

## Core Features:

- PIN Access & Authentication: Enables customers to securely access their session using a unique 6-character PIN, with server-side cookie authentication and PIN validation.
- Personalized Session Dashboard: Presents a custom welcome message and session details (customer name, table) upon successful authentication, featuring the 'Fast Refills' section.
- Fast Refill Ordering: Allows customers to easily select and send refill requests for menu items, with server-side cooldown and quantity checks for abuse prevention.
- Service & Add-on Assistance: Provides dedicated 'Call Server' and 'Request Add-ons' buttons for immediate staff assistance or to inquire about add-on offerings.
- Request History Tracking: Displays a chronological list of the customer's last 10 refill and service requests along with their current status (queued, accepted, preparing, served, rejected).
- Session Status Monitoring: Actively tracks the customer session status via backend APIs, gracefully redirecting to a 'Session Closed' page if the session expires.
- Progressive Web App (PWA) Support: The application is built as a Progressive Web App, ensuring installability, fast loading, and offline capabilities for a seamless, native-like experience across all devices.

## Style Guidelines:

- The visual design aligns with the existing SharEat POS system, emphasizing clarity and efficiency. The primary brand color is a vibrant red (e.g., #E00000) for headers and key interactive elements. A bright yellow/orange (e.g., #FFC107) serves as a secondary accent for highlights and active states. Main backgrounds are a very light grey (e.g., #F0F2F5) with white (e.g., #FFFFFF) used for content cards, ensuring readability in various lighting conditions. Text colors are dark grey (e.g., #333333) for primary information, with lighter shades for secondary details. Specific green (e.g., #28A745) and red (e.g., #DC3545) are used for success and error/negative status indicators, respectively.
- A clean, modern sans-serif font, such as 'Inter' or 'Roboto', will be used across the application for high legibility and a professional feel, consistent with the POS system. Headings will be bold and larger to establish clear hierarchy, while body text will maintain a comfortable reading weight and size for short instructions and vital information. Numbers will often be bold for emphasis.
- Simple, intuitive, and clean outline-style icons are chosen to complement large tap targets and minimize steps, ensuring a frictionless user experience on mobile devices. Icons should clearly represent actions like 'Call Server', 'Request Refill', or status updates, matching the minimal aesthetic of the POS.
- The layout is strictly mobile-first and optimized for small screens, prioritizing essential information and actions. It embraces a modern, minimalist card-based design with rounded corners, similar to the provided reference. Generous use of whitespace and padding ensures a clean, uncluttered visual hierarchy and highlights key content. All elements, especially interactive ones, are designed with large, easily tappable targets to ensure fast, frictionless navigation and readability even in busy restaurant environments. The overall structure is clean and organized, mirroring the POS dashboard's logical presentation.
- Subtle animations and transitions provide visual feedback for user actions, such as successfully submitting a refill request or navigating between pages, enhancing the feeling of responsiveness without distracting from the core tasks.