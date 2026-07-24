import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    tag: z.string(),
    date: z.string(),
    isoDate: z.date(),
    readTime: z.string().optional(),
    heroImage: z.string().optional(),
  }),
});

export const collections = { blog };
