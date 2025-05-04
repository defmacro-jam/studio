import { ai } from "../ai-instance";
import { generate } from "genkit";
import { z } from "zod";

const JustificationSchema = z.object({
    rating: z.number().min(1).max(5),
    justification: z.string(),
});

const CategorizationSchema = z.object({
    category: z.enum(['well', 'improve', 'discuss']),
    reasoning: z.string().optional().describe("Brief explanation for the chosen category"),
});

export const categorizeJustificationFlow = ai.flow(
    {
        name: 'categorizeJustification',
        inputSchema: JustificationSchema,
        outputSchema: CategorizationSchema,
    },
    async ({ rating, justification }) => {
        if (!justification?.trim()) {
            // If no justification, categorize based purely on rating
            const category = rating >= 4 ? 'well' : 'improve';
            return { category, reasoning: "Categorized based on rating only (no justification provided)." };
        }

        const prompt = `
            Analyze the following team retrospective feedback and categorize it.
            The user provided a rating of ${rating} out of 5 stars (1=bad, 5=good).
            Their justification is: "${justification}"

            Based on the content of the justification and the rating, decide if this feedback primarily belongs in:
            1.  'well': Things that went well, positive feedback.
            2.  'improve': Things that could be improved, constructive criticism, challenges.
            3.  'discuss': Topics that need further discussion, questions, neutral observations needing clarification.

            Consider these rules:
            - If the rating is 4 or 5 and the justification is positive or neutral, lean towards 'well'.
            - If the rating is 1 or 2 and the justification is negative or describes problems, lean towards 'improve'.
            - If the rating is 3, or if the justification is mixed, ambiguous, asks questions, or raises a point needing team input, lean towards 'discuss'.
            - If the justification clearly contradicts the rating (e.g., rating 5 but only listing problems), prioritize the justification's sentiment and consider 'discuss' or 'improve'.
            - If the justification mentions both good and bad points, lean towards 'discuss'.

            Output ONLY the JSON object with the category and a brief reasoning.
        `;

        const llmResponse = await generate({
            prompt: prompt,
            model: ai.getModel(),
            output: { schema: CategorizationSchema },
            config: { temperature: 0.3 } // Lower temperature for more deterministic categorization
        });

        return llmResponse.output() ?? { category: 'discuss', reasoning: 'Defaulted to discuss due to an issue generating categorization.' };
    }
);

// Ensure the flow is registered by importing it in dev.ts
// Add `import './flows/categorize-justification';` to src/ai/dev.ts
