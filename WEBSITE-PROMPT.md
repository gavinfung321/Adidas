# Into the Blue — Complete Website Prompt

Copy the prompt below into your website-building assistant and attach the relevant product photographs and landscape assets.

**About this prompt:** This is a consolidated prompt for recreating the finished concept, incorporating the design refinements made during development. It is not a record of a single original generation. Results will vary by model, tools, and supplied assets.

**Demo:** https://gavinfung321.github.io/Adidas/

**Creator:** Gavin Fung of [HKAAA](https://hkaiautomation.com/).

Original product photographs and adidas branding belong to their respective rights holders. Sharing this prompt does not grant rights to reuse those assets. This is an independent concept demo, not an official adidas website.

---

## Copyable prompt

Build a polished, complete ecommerce concept website called “Into the Blue” for an adidas Originals blue padded jacket.

This is an independent portfolio demonstration by Gavin Fung of HKAAA. It should feel like a carefully art-directed fashion campaign, with a working product exploration experience and a simulated purchase flow.

Implement the website, rather than returning only a plan. Make thoughtful design decisions where needed. Use the supplied images and assets, and inspect the existing project before choosing the implementation approach. Preserve the existing framework if there is one; otherwise use a lightweight approach suitable for static hosting.

Do not publish the website until I explicitly ask you to go live. Build and test it locally, and give me a working preview link.

### PROJECT GOAL

Create an immersive winter-themed product website where the blue jacket is always the main focus.

The experience should combine:
- A striking alpine hero.
- Subtle cursor-driven depth on desktop.
- A scroll-driven transition that brings the jacket closer and introduces a second message.
- Editorial product storytelling.
- Product detail photography.
- An interactive front/back product gallery.
- A small winter jacket collection.
- A polished demo purchase modal.
- A deliberately composed mobile experience.
- A favicon and social sharing image.

Do not implement a real shopping cart, customer accounts, CRM, database, or payment processing in this version. The Buy now experience must clearly be a simulation and must not collect payment or personal information.

### VISUAL DIRECTION

The aesthetic is quiet, premium, editorial, and winter-inspired.

Use:
- Pale icy blue.
- Blue-grey.
- Warm off-white.
- Deep charcoal for text and primary dark buttons.
- Generous spacing.
- Large, bold, condensed display typography.
- A clean, readable sans-serif for body text and navigation.
- Small uppercase labels with restrained letter spacing.
- Mostly square corners and fine borders.
- Minimal decorative UI.

Avoid generic startup styling, excessive rounded cards, colourful gradients, dashboard-like components, heavy drop shadows, or repeated identical two-column sections.

Make each section have a distinct composition while maintaining consistent typography, spacing, and colour.

Keep the product photography large and compelling. Do not fill the page with unnecessary copy.

### ASSETS AND PRODUCT ACCURACY

Use the provided jacket photographs as the source of truth.

The featured product is:
FK Denim Down JKT.

Verified product details:
- Loose fit.
- Washed pale blue denim-look appearance.
- Main material: 100% recycled polyester.
- Lining: 100% recycled polyester.
- Plain weave construction.
- Filling: 80% duck down and 20% duck feathers.

Visible design details include:
- A large padded hood.
- A central dark zipper.
- Diagonal chest zip pockets.
- Gathered cuffs and hem.
- A white Originals Trefoil on the chest.
- Washed texture and distressed surface details.

Do not describe the shell as actual cotton denim. It has a denim-look finish but the supplied material information specifies polyester.

Do not include the product code.

Do not invent waterproof ratings, temperature ratings, technical mountaineering performance, sustainability certifications, prices, availability, reviews, or other unsupported claims.

Use the supplied images thoughtfully:
- Transparent standalone jacket cutout for the alpine hero.
- Front photograph of the model wearing the full jacket for the main product gallery.
- Rear model photograph for the back view.
- Full-body hood-up model photograph for the editorial section.
- Pocket/cuff close-up for material detail.
- Shoulder zipper photograph for construction detail.
- Standalone jacket image for the purchase modal.
- Brown-and-black, black, and grey padded jackets for the winter collection.

Use matching supplied landscape assets for clouds, mountains, and foreground snow. If an essential asset is unavailable, identify the missing asset and provide a sensible temporary fallback. Do not silently substitute unrelated products.

### HEADER AND NAVIGATION

Create a clean header with:
- An adidas Originals-style brand treatment on the left, using a supplied suitable logo asset where available.
- A thin vertical separator.
- The small label “A WINTER STUDY”.
- No “/01” numbering.

Desktop navigation:
- The story
- Details
- The jacket
- The winter edit
- Buy now

Use clear anchor links to the appropriate sections.

Do not add another “Explore the jacket” menu item, because it duplicates “The jacket”.

The desktop Buy now button should be dark charcoal with clear white wording and a small diagonal arrow.

At the top of the page, integrate the header visually with the hero. Avoid a thick strip, oversized border, or visible gap between the navigation and hero.

When the user scrolls beyond the hero, the header may gain a clean opaque background to maintain readability.

On mobile:
- Show the brand on the left.
- Show a compact text button labelled “Menu” on the right.
- Do not put a plus sign beside Menu.
- Open an accessible menu with the same navigation options and Buy now.
- Close it when a link is selected, when Escape is pressed, or when the user clicks outside it.
- Keep the menu above all decorative hero layers.

### HERO: INTO THE BLUE

Create a large cinematic hero with text on the left and the floating jacket on the right on desktop.

Main copy:
Small label:
“ORIGINALS. A DIFFERENT OUTLOOK.”

Headline:
“INTO
THE BLUE.”

Supporting sentence:
“A softer side of winter.”

Primary CTA:
“Buy now” with a small diagonal arrow.

The jacket should be large, opaque, detailed, and visually dominant. Keep its entire hood, sleeves, and hem visible in the opening composition where the screen proportions allow.

On wide desktop screens, bring the jacket slightly towards the centre so it does not feel pushed against the far-right edge.

Give the jacket a subtle, soft grounding shadow beneath it. The shadow should support the floating effect without becoming a dark distracting oval.

Use layered alpine scenery:
1. A pale winter sky.
2. Realistic textured clouds.
3. Distant snow mountains.
4. A nearer mountain layer where suitable assets exist.
5. A foreground snow-covered rock or ledge near the bottom.
6. The jacket as the dominant product layer.
7. Carefully placed headline and CTA.

The clouds must feel photographic, with tonal variation and natural texture. Avoid artificial-looking white blobs, over-blurred shapes, or repeated cloud stamps.

The mountains must be recognisable and detailed rather than almost invisible behind a pale overlay. Balance their contrast so the jacket remains the focus.

The foreground snow should create a clear sense of depth and sit high enough to contribute to the composition, without hiding the jacket’s defining details.

Keep the left-hand text area readable. Use subtle local tonal control if needed rather than washing out the entire scene.

Do not include the three small bottom hero labels:
- Scroll to discover
- 01 — Into the blue
- Go straight to the details

### DESKTOP CURSOR PARALLAX

Add restrained cursor-driven movement within the hero for devices with a fine pointer.

The movement should:
- Ease smoothly towards the pointer position.
- Move the jacket slightly in the direction of the cursor.
- Keep the clouds and mountains moving together as a coordinated background group.
- Give the foreground a different movement strength to create visible depth.
- Keep typography stable enough to read.
- Return gently to the neutral position when the pointer leaves.

Use small, controlled movements. The jacket should not spin, swing dramatically, stretch, or feel like a toy.

Keep decorative layers large enough that movement never exposes empty edges.

Use lightweight transforms and requestAnimationFrame where appropriate. Do not add Three.js just for a flat image shadow or simple parallax.

Disable cursor parallax on touch devices and respect reduced-motion preferences.

### DESKTOP SCROLL TRANSITION

Create a controlled scroll-driven transition within the hero area.

The sequence should feel like the viewer moves closer to the jacket:
- Begin with the opening headline on the left and jacket on the right.
- As the user scrolls, the opening copy moves left and fades away.
- The jacket moves towards the left and becomes modestly larger.
- The foreground snow moves downward and leaves the main composition.
- The landscape changes position subtly to reinforce depth.
- A new message appears on the right.
- The hero then releases into the normal page flow.

Second message:
Small label:
“A CLOSER PERSPECTIVE”

Headline:
“BIG ON SHAPE.
QUIET IN BLUE.”

Supporting copy:
“Washed blue texture. Generous proportions.
A closer look at the details.”

CTA:
“Buy now”

Use a sticky hero with a sensible scroll distance, roughly two to three viewport heights if appropriate. Tune the distance visually so the transition does not feel slow or trap the visitor.

The animation must track scrolling in both directions and remain smooth.

Preserve native scrolling. Do not hijack the mouse wheel or force users through an autoplay sequence.

If reduced motion is enabled, display the messages and imagery in a readable static arrangement.

### MOBILE HERO

Design the mobile hero intentionally rather than shrinking the desktop layout.

Priorities:
- The jacket remains the main subject.
- The jacket must be fully opaque.
- Text and CTA must not obscure most of the product.
- The jacket should sit higher, closer to the visual centre.
- The headline should be compact enough to leave room for the jacket.
- Keep the supporting sentence short.
- Keep the CTA compact and its wording prominent.
- Reduce unnecessary internal button padding.
- Allow a small amount of jacket overlap with the headline or the edge of the CTA to create depth.
- Do not obscure essential wording or make the CTA difficult to tap.
- Keep decorative layers from intercepting pointer events.

Place the jacket above background scenery in the stacking order. Do not accidentally make the mountains show through the garment.

Keep clouds visible towards the top, mountains behind the lower jacket, and foreground snow near the bottom.

Do not force the long desktop pinned animation onto small screens. Present the second hero message as a clean follow-on section where that works better.

Check narrow phone widths as well as wider phones. Avoid horizontal overflow, cropped navigation, tiny text, and excessive empty space.

### BUTTON STYLING

The main hero CTA should have visually prominent wording without excessive padding.

For desktop, use roughly:
- 18px bold text.
- A minimum height around 54px.
- A width around 160px, adjusted to the composition.
- Tight, balanced horizontal padding.
- A clear arrow aligned on the right.

The navigation Buy now button should remain smaller than the hero CTA.

On mobile, keep buttons comfortable to tap while avoiding oversized white rectangles that cover the jacket.

Use clear hover and keyboard-focus states.

### STORY / MATERIAL SECTION

After the hero sequence, introduce a large close-up photograph of the jacket’s pocket, cuff, and washed surface.

Use the short caption:
“THE DETAILS MAKE THE DIFFERENCE.”

Let the photography carry the section. Avoid repeating the hero headline or adding another large block of general marketing copy.

### DETAILS SECTION

Small label:
“A CLOSER LOOK”

Headline:
“IT’S ALL
IN THE DETAILS.”

Short introduction:
“Three perspectives on
one distinctive jacket.”

Create three visually balanced image-led items:

1. “Room to be yourself.”
   “A broad silhouette, generous sleeves and gathered cuffs create its distinctive volume.”
   Use an image showing the jacket’s shape.

2. “A different angle.”
   “A closer look at the shoulder zipper, stitched edges and washed blue texture.”
   Use the shoulder detail photograph.

3. “Every side has a story.”
   “Washed texture, subtle distressed marks and a small rear patch reward a closer look.”
   Use the rear view.

Small numbering inside these three items is acceptable. Avoid numbered section headers such as “02 / A CLOSER LOOK”.

On desktop, use a three-column composition. On mobile, stack the items with comfortable spacing.

Use subtle reveal motion if appropriate, but keep it secondary to the hero.

### EDITORIAL SECTION: A CHANGE OF PERSPECTIVE

This section must look noticeably different from the main product-information section.

Use an asymmetric editorial composition:
- A narrower text area on the left.
- A larger full-body model photograph on the right.
- A small overlapping pocket-detail image as an inset.
- Plenty of space around the composition.

Copy:
Small label:
“A CHANGE OF PERSPECTIVE”

Headline:
“A DIFFERENT
PERSPECTIVE.”

Short sentence:
“The shape comes to life.”

Optional small image caption:
“THE SILHOUETTE / IN PERSPECTIVE”

Inset caption:
“A CLOSER FEEL.”

Show the full-body model with the hood up. Preserve the shoes and overall silhouette rather than cropping everything into another torso image.

Do not add a long paragraph or another unnecessary CTA.

On mobile, put the heading above the main photograph and position the inset carefully so it does not hide important product details or overflow.

### MAIN PRODUCT SECTION

Create a functional product exploration area.

Desktop:
- Large image gallery on the left.
- Product information on the right.

Mobile:
- Gallery first.
- Product information below.

Gallery:
- Default image: front view of the model wearing the complete jacket.
- Second image: rear view.
- Clearly labelled Front and Back thumbnails.
- Visible selected state.
- A “View larger” affordance that opens an accessible image modal.
- Preserve image proportions and use suitable cropping.

Copy:
Small label:
“THE JACKET”

Headline:
“BLUE.
WITH VOLUME.”

Product name:
“FK Denim Down JKT”

Description:
“A loose-fit down jacket with a washed denim-look finish, diagonal zip pockets and the Originals Trefoil.”

Colour:
“Washed pale blue”
Small secondary label:
“Shown colour”

Include an accordion titled “Design details” containing concise verified information:
“Loose fit with a large padded hood, diagonal chest zip pockets and gathered cuffs and hem. Shell and lining: 100% recycled polyester in a plain weave. Filling: 80% duck down and 20% duck feathers.”

Include a second accordion titled “About this concept” explaining briefly that this is an independent product-study demo.

Add a “View jacket notes” button opening a concise information modal.

Small supporting line:
“A product study. Explore the details; imagine the possibilities.”

Do not include an invented selling price or stock availability.

### WINTER EDIT

Create a collection section featuring three additional padded jackets supplied in the reference images:
- Brown and black colour-block padded jacket.
- Black padded jacket.
- Grey hooded padded jacket with white sleeve stripes.

Use these winter jackets rather than unrelated lightweight jackets so the collection remains visually coherent.

Section label:
“THE WINTER EDIT”

Headline:
“MORE WAYS
TO MEET WINTER.”

Short introduction:
“Padded shapes. Different personalities.
Find your own winter perspective.”

Card copy:

Brown & black.
“A contrast of tones. A generous padded shape.”

Quietly black.
“Quilted volume with a clean, understated finish.”

Grey, with stripes.
“A padded hood and a graphic line down each sleeve.”

Each card should show a large product image and a working “View details” button.

Open a simple product-detail modal with the selected image and descriptive copy. Clearly identify these as descriptive concept labels where official names and specifications are not provided.

Do not invent materials, prices, or availability for these products.

### DEMO PURCHASE MODAL

Every Buy now button should open the same accessible purchase modal.

Desktop layout:
- Product gallery on the left.
- Product name, size selection, and action on the right.

Mobile layout:
- A comfortable vertical layout that fits within the viewport and scrolls internally when necessary.
- An always-reachable close control.
- No horizontal overflow.

Modal copy:
Small label:
“THE JACKET / DEMO PURCHASE”

Headline:
“MAKE IT YOURS.”

Product:
“FK Denim Down JKT”

Secondary line:
“Loose fit · Washed pale blue”

Gallery:
- Front standalone jacket.
- Back view.
- Worn view.
- Three labelled thumbnails: Front, Back, Worn.
- Working selection states.

Size selector:
S, M, L, XL.

Require the user to select a size before completing the demo.

Disclosure:
“Interactive demo only. Price and availability are not confirmed. No payment is collected or order placed.”

Primary action:
“Complete demo order”

After submission, show:
“You’re all set.”

Summary:
“FK Denim Down JKT · Size [selected size] · Quantity 1”

Explanation:
“This was a demo. No payment was taken and no order will be shipped.”

Action:
“Continue exploring”

Reset the form and gallery when the purchase modal is reopened.

Support:
- Escape to close.
- Keyboard navigation.
- Correct dialog labelling.
- Focus management.
- Returning focus to the trigger after closing.
- Background scroll locking while the modal is open.

Do not connect to a real payment provider or send order data.

### FOOTER

Use a bold closing statement:
“ORIGINAL
PERSPECTIVES.
ALWAYS.”

Include:
“INTO THE BLUE / 2026”

Creator credit:
“Website demo by Gavin Fung of HKAAA.”

Link HKAAA to:
https://hkaiautomation.com/

Include:
“Independent concept demo. Not an official adidas website.”

Include this image attribution:
“Original product photographs sourced from the adidas website belong to adidas and their respective rights holders, not to us. Some visuals have been AI-edited for this demo.”

Include a working “Back to top” link.

Keep the legal and attribution text readable but visually secondary.

### FAVICON AND SOCIAL PREVIEW

Create a crisp favicon suited to a small browser tab. Use a supplied suitable brand mark or a simplified high-contrast treatment that fits the site’s pale-blue and charcoal palette.

Create a 1200 × 630 social sharing image using:
- The alpine background.
- The blue jacket as the dominant product.
- “INTO THE BLUE.”
- “A softer side of winter.”
- A small “Website demo by Gavin Fung / HKAAA” credit.
- A small independent-concept designation.

Keep important elements inside safe margins and make the headline readable at thumbnail size.

Add:
- Page title.
- Meta description.
- Favicon reference.
- Open Graph title, description, URL, and image.
- Social image dimensions and alternative text.
- Twitter large-image card metadata.

The intended public URL is:
https://gavinfung321.github.io/Adidas/

Use asset paths that work under the /Adidas/ subdirectory. Use absolute public URLs where required for sharing metadata.

### TECHNICAL AND ACCESSIBILITY REQUIREMENTS

Use semantic HTML and accessible controls.

Ensure:
- All navigation links lead to the intended section.
- Sticky navigation does not hide section headings.
- All buttons perform a meaningful action.
- Galleries work with keyboard input.
- Images have appropriate alternative text.
- Decorative landscape images are ignored by assistive technology.
- Focus states are visible.
- Text contrast is adequate.
- Reduced-motion preferences are respected.
- Touch devices do not depend on hover.
- No decorative layer blocks buttons.
- No horizontal page overflow.
- No broken images or console errors.
- Modals remain usable on short screens and mobile.
- Product images retain their proportions.
- Fonts load reliably.
- The hero image loads promptly.
- Lower-page images can load progressively without breaking layouts.

Keep the implementation lightweight. Use CSS transforms and efficient animation updates. Avoid unnecessary dependencies.

Do not require a video asset for the hero. The effect should work with layered static images.

Do not modify the public deployment or push changes live until I explicitly request it.

### VALIDATION AND DELIVERY

Test the completed site at:
- A wide desktop viewport.
- A standard laptop viewport.
- A narrow mobile viewport.
- A wider mobile viewport.

Check the complete journey:
1. Open the hero.
2. Move the cursor to verify desktop parallax.
3. Scroll through the hero transition.
4. Continue through every section.
5. Switch product gallery images.
6. Open and close enlarged images and product notes.
7. Open the winter jacket detail modals.
8. Open Buy now.
9. Switch purchase gallery images.
10. Select a size.
11. Complete the simulated order.
12. Close the modal and continue browsing.
13. Open and use the mobile menu.
14. Reach the footer and return to the top.

Inspect the rendered desktop and mobile layouts and fix obvious visual issues before handing over.

Deliver the complete working local website, the preview link, and a short summary of what was built. Identify any missing assets or remaining limitations honestly.
