# Bunz — Premium Automation Workflows for Marketplace

## CRITICAL RULES
- Codebase is at the repo root
- DO NOT re-scaffold or overwrite working features — ADD to them
- These workflows get seeded as marketplace listings owned by userId=1 (the owner)
- Each workflow also gets a workflow_presets record so users can install them directly
- Use existing marketplace listing creation pattern in storage.ts
- Use `safeAlter()` for any new columns needed
- Pricing is in cents (e.g., $19.99 = 1999)
- FREE workflows have priceCents = 0, priceType = "free"
- Paid workflows have priceType = "one_time"

## TASK: Seed 10 Automation Workflows into Marketplace + Presets

Create a new file `server/seed-workflows.ts` that exports a function `seedMarketplaceWorkflows()`. Call it from storage.ts after table creation (similar pattern to existing seed data).

Each workflow needs:
1. A `marketplace_listings` record (for the store)
2. A `workflow_presets` record (for the workflow builder template)

### Workflow 1: AI Cold Outreach Pipeline (FREE)
**Price:** $0.00 (Free)
**Category:** marketing
**ROI:** 25-45% higher reply rates vs manual outreach

**Description:** Automated cold email pipeline that researches prospects, personalizes messages using AI, sends sequenced follow-ups, and scores responses. Proven to increase reply rates from 2% to 7-15%.

**Template (workflow steps):**
```json
{
  "nodes": [
    {"id": "1", "type": "trigger", "data": {"label": "New Lead Added", "config": {"source": "csv_upload_or_crm"}}},
    {"id": "2", "type": "ai_call", "data": {"label": "Research Prospect", "config": {"prompt": "Research this prospect's company, role, and recent activity. Find personalization hooks.", "model": "auto"}}},
    {"id": "3", "type": "ai_call", "data": {"label": "Generate Personalized Email", "config": {"prompt": "Write a cold email using the research. Be concise, reference something specific about their company, and include a clear CTA. No generic templates.", "model": "auto"}}},
    {"id": "4", "type": "api_call", "data": {"label": "Send Email", "config": {"endpoint": "email_provider", "method": "POST"}}},
    {"id": "5", "type": "conditional", "data": {"label": "Reply Received?", "config": {"condition": "reply_detected", "trueBranch": "6", "falseBranch": "7"}}},
    {"id": "6", "type": "ai_call", "data": {"label": "Score & Classify Reply", "config": {"prompt": "Classify this reply as: interested, objection, not_interested, out_of_office. If interested, draft a follow-up.", "model": "auto"}}},
    {"id": "7", "type": "api_call", "data": {"label": "Send Follow-up (Day 3)", "config": {"delay": "3d", "endpoint": "email_provider"}}},
    {"id": "8", "type": "transform", "data": {"label": "Log Results to CRM", "config": {"action": "update_lead_status"}}}
  ],
  "edges": [
    {"from": "1", "to": "2"}, {"from": "2", "to": "3"}, {"from": "3", "to": "4"},
    {"from": "4", "to": "5"}, {"from": "5", "to": "6"}, {"from": "5", "to": "7"},
    {"from": "6", "to": "8"}, {"from": "7", "to": "8"}
  ]
}
```

### Workflow 2: AI Content Writer + Publisher (FREE)
**Price:** $0.00 (Free)
**Category:** content
**ROI:** 86% of marketers save several hours daily; scales content 3-5x

**Description:** Generate SEO-optimized blog posts, auto-format for your CMS, and publish on schedule. Includes keyword research, outline generation, writing, and editing steps. One person matches a 3-person content team.

**Template:**
```json
{
  "nodes": [
    {"id": "1", "type": "trigger", "data": {"label": "Content Brief Submitted", "config": {"source": "form_or_schedule"}}},
    {"id": "2", "type": "ai_call", "data": {"label": "Keyword Research", "config": {"prompt": "Analyze the topic and find 5-10 high-value keywords with search volume estimates. Prioritize long-tail keywords with low competition.", "model": "auto"}}},
    {"id": "3", "type": "ai_call", "data": {"label": "Generate Outline", "config": {"prompt": "Create a detailed blog post outline with H2/H3 structure, key points per section, and target word count. Include SEO title and meta description.", "model": "auto"}}},
    {"id": "4", "type": "ai_call", "data": {"label": "Write Full Article", "config": {"prompt": "Write the full article following the outline. Use natural language, include the target keywords organically, add statistics where relevant. Target 1500-2500 words.", "model": "auto"}}},
    {"id": "5", "type": "ai_call", "data": {"label": "Edit & Polish", "config": {"prompt": "Review and edit: fix grammar, improve flow, ensure SEO best practices, add internal link suggestions, and verify claims are reasonable.", "model": "auto"}}},
    {"id": "6", "type": "transform", "data": {"label": "Format for CMS", "config": {"action": "convert_to_html_with_metadata"}}},
    {"id": "7", "type": "api_call", "data": {"label": "Publish to CMS", "config": {"endpoint": "cms_api", "method": "POST", "schedule": "configurable"}}}
  ],
  "edges": [
    {"from": "1", "to": "2"}, {"from": "2", "to": "3"}, {"from": "3", "to": "4"},
    {"from": "4", "to": "5"}, {"from": "5", "to": "6"}, {"from": "6", "to": "7"}
  ]
}
```

### Workflow 3: AI Lead Generation + Qualification Engine ($19.99)
**Price:** $19.99
**Category:** sales
**ROI:** 340-410% ROI, 43% increase in qualified opportunities, 50% higher lead-to-deal conversion

**Description:** Full-funnel lead generation system. Scrapes prospects matching your ICP, enriches contact data, scores leads with AI + rule-based filters, routes hot leads for immediate follow-up, and nurtures warm leads automatically. Used by HubSpot, Microsoft, IBM with proven 340%+ ROI.

**Template:**
```json
{
  "nodes": [
    {"id": "1", "type": "trigger", "data": {"label": "Scheduled: Daily Scan", "config": {"cron": "0 8 * * 1-5"}}},
    {"id": "2", "type": "api_call", "data": {"label": "Scrape Target Prospects", "config": {"endpoint": "prospect_source", "filters": {"industry": "configurable", "company_size": "configurable", "role": "configurable"}}}},
    {"id": "3", "type": "api_call", "data": {"label": "Enrich Contact Data", "config": {"endpoint": "enrichment_api", "fields": ["email", "phone", "company_revenue", "tech_stack"]}}},
    {"id": "4", "type": "transform", "data": {"label": "Rule-Based Scoring", "config": {"rules": [{"field": "company_size", "operator": ">", "value": 50, "points": 20}, {"field": "role_match", "operator": "==", "value": true, "points": 30}, {"field": "tech_stack_fit", "operator": "contains", "value": "configurable", "points": 25}]}}},
    {"id": "5", "type": "ai_call", "data": {"label": "AI Intent Analysis", "config": {"prompt": "Analyze this prospect's recent activity, social posts, and company news. Rate their likely buying intent from 1-10 and explain why.", "model": "auto"}}},
    {"id": "6", "type": "conditional", "data": {"label": "Score > 70?", "config": {"condition": "total_score > 70", "trueBranch": "7", "falseBranch": "8"}}},
    {"id": "7", "type": "api_call", "data": {"label": "Route to Sales (Hot Lead)", "config": {"endpoint": "crm", "action": "create_task", "priority": "high"}}},
    {"id": "8", "type": "api_call", "data": {"label": "Add to Nurture Sequence", "config": {"endpoint": "email_sequence", "sequence": "warm_leads"}}},
    {"id": "9", "type": "transform", "data": {"label": "Log to Dashboard", "config": {"action": "update_lead_pipeline"}}}
  ],
  "edges": [
    {"from": "1", "to": "2"}, {"from": "2", "to": "3"}, {"from": "3", "to": "4"},
    {"from": "4", "to": "5"}, {"from": "5", "to": "6"}, {"from": "6", "to": "7"},
    {"from": "6", "to": "8"}, {"from": "7", "to": "9"}, {"from": "8", "to": "9"}
  ]
}
```

### Workflow 4: AI Email Marketing Automation ($17.99)
**Price:** $17.99
**Category:** marketing
**ROI:** $36 return per $1 spent, 320% higher ROI vs manual, 52% higher open rates

**Description:** Complete email marketing automation: welcome series, cart recovery, post-purchase upsell, re-engagement, and browse abandonment. AI optimizes send times, writes subject lines, and personalizes content. These 5 flows generate 80% of all email revenue.

**Template:**
```json
{
  "nodes": [
    {"id": "1", "type": "trigger", "data": {"label": "Event Trigger", "config": {"events": ["new_subscriber", "cart_abandoned", "purchase_complete", "inactive_30d", "browse_no_buy"]}}},
    {"id": "2", "type": "conditional", "data": {"label": "Route by Event Type", "config": {"branches": {"new_subscriber": "3", "cart_abandoned": "4", "purchase_complete": "5", "inactive_30d": "6", "browse_no_buy": "7"}}}},
    {"id": "3", "type": "ai_call", "data": {"label": "Welcome Series (3 emails)", "config": {"prompt": "Write a 3-email welcome series. Email 1: warm welcome + brand story. Email 2: top products/features. Email 3: special offer for first purchase. Personalize with subscriber name and signup source.", "model": "auto"}}},
    {"id": "4", "type": "ai_call", "data": {"label": "Cart Recovery (3 emails)", "config": {"prompt": "Write a 3-email abandoned cart sequence. Email 1 (1hr): gentle reminder with cart items. Email 2 (24hr): social proof + urgency. Email 3 (48hr): discount offer. Include product images and direct cart link.", "model": "auto"}}},
    {"id": "5", "type": "ai_call", "data": {"label": "Post-Purchase Upsell", "config": {"prompt": "Based on what the customer just bought, recommend complementary products. Write a thank-you email with personalized recommendations. Include review request.", "model": "auto"}}},
    {"id": "6", "type": "ai_call", "data": {"label": "Re-engagement Campaign", "config": {"prompt": "Write a win-back email for an inactive subscriber. Reference what they previously engaged with. Include a compelling reason to return and an exclusive offer.", "model": "auto"}}},
    {"id": "7", "type": "ai_call", "data": {"label": "Browse Abandonment", "config": {"prompt": "Write an email for someone who browsed products but didn't add to cart. Reference the specific products they viewed. Soft sell with helpful content.", "model": "auto"}}},
    {"id": "8", "type": "ai_call", "data": {"label": "Optimize Send Time", "config": {"prompt": "Based on subscriber timezone and historical open patterns, determine optimal send time.", "model": "auto"}}},
    {"id": "9", "type": "api_call", "data": {"label": "Send via Email Provider", "config": {"endpoint": "email_provider", "schedule": "ai_optimized"}}},
    {"id": "10", "type": "transform", "data": {"label": "Track & Report", "config": {"metrics": ["open_rate", "click_rate", "conversion", "revenue"]}}}
  ],
  "edges": [
    {"from": "1", "to": "2"}, {"from": "2", "to": "3"}, {"from": "2", "to": "4"},
    {"from": "2", "to": "5"}, {"from": "2", "to": "6"}, {"from": "2", "to": "7"},
    {"from": "3", "to": "8"}, {"from": "4", "to": "8"}, {"from": "5", "to": "8"},
    {"from": "6", "to": "8"}, {"from": "7", "to": "8"}, {"from": "8", "to": "9"},
    {"from": "9", "to": "10"}
  ]
}
```

### Workflow 5: AI Content Repurposing Engine ($14.99)
**Price:** $14.99
**Category:** content
**ROI:** 300% more content output, 60% less effort, brands report 240-320% engagement increase

**Description:** Turn one piece of content into 10+. Feed in a blog post, video transcript, or podcast and get Twitter threads, LinkedIn posts, email newsletters, Instagram captions, YouTube shorts scripts, and more — all in your brand voice. DoorDash saw 240% engagement increase, Nike reported 320% content ROI improvement.

**Template:**
```json
{
  "nodes": [
    {"id": "1", "type": "trigger", "data": {"label": "Source Content Uploaded", "config": {"types": ["blog_post", "video_transcript", "podcast_transcript", "webinar"]}}},
    {"id": "2", "type": "ai_call", "data": {"label": "Extract Key Points", "config": {"prompt": "Extract the 5-7 most important points, key quotes, statistics, and actionable takeaways from this content. Also identify the target audience and tone.", "model": "auto"}}},
    {"id": "3", "type": "ai_call", "data": {"label": "Generate Twitter/X Thread", "config": {"prompt": "Create a 5-8 tweet thread from the key points. Make it engaging, use hooks, include a CTA at the end. No hashtag spam — 1-2 relevant tags max.", "model": "auto"}}},
    {"id": "4", "type": "ai_call", "data": {"label": "Generate LinkedIn Post", "config": {"prompt": "Write a LinkedIn post (150-300 words) with a strong hook in the first line. Include insights, a personal angle, and end with a question to drive comments.", "model": "auto"}}},
    {"id": "5", "type": "ai_call", "data": {"label": "Generate Email Newsletter Section", "config": {"prompt": "Write a newsletter-style summary (200 words max) with a compelling subject line. Conversational tone, one key takeaway, and a link to the full content.", "model": "auto"}}},
    {"id": "6", "type": "ai_call", "data": {"label": "Generate Instagram Caption", "config": {"prompt": "Write an Instagram caption with a hook, value-packed body, and CTA. Include 5-10 relevant hashtags at the end.", "model": "auto"}}},
    {"id": "7", "type": "ai_call", "data": {"label": "Generate Short Video Script", "config": {"prompt": "Write a 60-second video script (YouTube Short / TikTok / Reel) from the most compelling point. Hook in first 3 seconds, value delivery, CTA.", "model": "auto"}}},
    {"id": "8", "type": "transform", "data": {"label": "Package All Outputs", "config": {"action": "bundle_content_pack"}}},
    {"id": "9", "type": "api_call", "data": {"label": "Schedule Posts", "config": {"endpoint": "social_scheduler", "platforms": ["twitter", "linkedin", "instagram"]}}}
  ],
  "edges": [
    {"from": "1", "to": "2"}, {"from": "2", "to": "3"}, {"from": "2", "to": "4"},
    {"from": "2", "to": "5"}, {"from": "2", "to": "6"}, {"from": "2", "to": "7"},
    {"from": "3", "to": "8"}, {"from": "4", "to": "8"}, {"from": "5", "to": "8"},
    {"from": "6", "to": "8"}, {"from": "7", "to": "8"}, {"from": "8", "to": "9"}
  ]
}
```

### Workflow 6: AI SEO Content Pipeline ($19.99)
**Price:** $19.99
**Category:** marketing
**ROI:** 602% ROI proven ($0→$3,674/mo in 14 months), sites sold for $59K-$108K

**Description:** End-to-end SEO content machine. Researches keywords, analyzes top-ranking competitors, generates optimized articles at scale, handles internal linking, and tracks rankings. One case study: $16,750 investment → $117,728 return (602% ROI). Another grew from $371/mo to $19,263/mo.

**Template:**
```json
{
  "nodes": [
    {"id": "1", "type": "trigger", "data": {"label": "Weekly Content Schedule", "config": {"cron": "0 9 * * 1"}}},
    {"id": "2", "type": "ai_call", "data": {"label": "Keyword Opportunity Analysis", "config": {"prompt": "Find 10 low-competition, high-value keywords in the target niche. For each: estimated monthly search volume, keyword difficulty score, and content angle. Prioritize informational queries with buyer intent.", "model": "auto"}}},
    {"id": "3", "type": "ai_call", "data": {"label": "Competitor Content Analysis", "config": {"prompt": "For the top keyword, analyze the top 5 ranking pages. What do they cover? What's missing? What angle can we take that's better or different?", "model": "auto"}}},
    {"id": "4", "type": "ai_call", "data": {"label": "Generate Article Brief", "config": {"prompt": "Create a detailed article brief: title (SEO-optimized), meta description, H2/H3 structure, key points per section, target word count, internal link opportunities, and schema markup suggestions.", "model": "auto"}}},
    {"id": "5", "type": "ai_call", "data": {"label": "Write SEO Article", "config": {"prompt": "Write a comprehensive, well-researched article following the brief. Natural keyword placement, engaging intro, actionable advice, proper heading hierarchy. Include FAQ section for featured snippet potential. 2000-3000 words.", "model": "auto"}}},
    {"id": "6", "type": "ai_call", "data": {"label": "SEO Audit & Optimization", "config": {"prompt": "Audit the article for SEO: keyword density, heading structure, readability score, internal link anchors, image alt text suggestions, schema markup. Suggest improvements.", "model": "auto"}}},
    {"id": "7", "type": "transform", "data": {"label": "Format with HTML + Schema", "config": {"action": "apply_seo_formatting"}}},
    {"id": "8", "type": "api_call", "data": {"label": "Publish & Submit to Search Console", "config": {"endpoint": "cms_api", "post_action": "request_indexing"}}}
  ],
  "edges": [
    {"from": "1", "to": "2"}, {"from": "2", "to": "3"}, {"from": "3", "to": "4"},
    {"from": "4", "to": "5"}, {"from": "5", "to": "6"}, {"from": "6", "to": "7"},
    {"from": "7", "to": "8"}
  ]
}
```

### Workflow 7: AI Social Media Automation ($14.99)
**Price:** $14.99
**Category:** marketing
**ROI:** 5,673% ROI, saves $140K/yr in time, 2-3x lead generation

**Description:** Full social media management on autopilot. AI generates platform-specific content, schedules optimally, monitors engagement, responds to comments, and reports performance. Replaces a $60-80K/yr social media manager or $3-10K/mo agency.

**Template:**
```json
{
  "nodes": [
    {"id": "1", "type": "trigger", "data": {"label": "Daily Content Schedule", "config": {"cron": "0 7 * * *"}}},
    {"id": "2", "type": "ai_call", "data": {"label": "Generate Daily Content Plan", "config": {"prompt": "Based on the content calendar, trending topics, and brand guidelines, create today's social media posts for Twitter, LinkedIn, and Instagram. Include: hook, body, CTA, hashtags (platform-appropriate). Match the brand voice.", "model": "auto"}}},
    {"id": "3", "type": "ai_call", "data": {"label": "Optimize for Each Platform", "config": {"prompt": "Adapt each post for its platform: Twitter (280 chars, punchy), LinkedIn (professional, longer), Instagram (visual-first, lifestyle). Add platform-specific best practices.", "model": "auto"}}},
    {"id": "4", "type": "ai_call", "data": {"label": "Generate Image Prompts", "config": {"prompt": "For each post that needs a visual, write an image generation prompt. Describe style, mood, composition. Keep consistent with brand aesthetic.", "model": "auto"}}},
    {"id": "5", "type": "api_call", "data": {"label": "Schedule Posts", "config": {"endpoint": "social_scheduler", "timing": "ai_optimized"}}},
    {"id": "6", "type": "trigger", "data": {"label": "Engagement Monitor (Every 2hrs)", "config": {"cron": "0 */2 * * *"}}},
    {"id": "7", "type": "ai_call", "data": {"label": "Draft Comment Responses", "config": {"prompt": "Review new comments/mentions. Draft personalized responses. Be helpful, on-brand, and human. Flag any negative sentiment for manual review.", "model": "auto"}}},
    {"id": "8", "type": "transform", "data": {"label": "Weekly Performance Report", "config": {"metrics": ["impressions", "engagement_rate", "follower_growth", "top_posts", "best_times"]}}}
  ],
  "edges": [
    {"from": "1", "to": "2"}, {"from": "2", "to": "3"}, {"from": "3", "to": "4"},
    {"from": "4", "to": "5"}, {"from": "6", "to": "7"}, {"from": "7", "to": "8"}
  ]
}
```

### Workflow 8: E-commerce Revenue Optimizer ($17.99)
**Price:** $17.99
**Category:** ecommerce
**ROI:** 30-50% revenue increase, 20-30% cart recovery, 191% ROI year 1

**Description:** All-in-one e-commerce automation: abandoned cart recovery, AI product descriptions, dynamic upsell/cross-sell, review management, and customer segmentation. A $500K store adding this workflow projected to generate $133K additional revenue year 1.

**Template:**
```json
{
  "nodes": [
    {"id": "1", "type": "trigger", "data": {"label": "E-commerce Event", "config": {"events": ["cart_abandoned", "product_viewed", "order_placed", "review_received"]}}},
    {"id": "2", "type": "conditional", "data": {"label": "Route by Event", "config": {"branches": {"cart_abandoned": "3", "product_viewed": "5", "order_placed": "6", "review_received": "8"}}}},
    {"id": "3", "type": "ai_call", "data": {"label": "Cart Recovery Email Sequence", "config": {"prompt": "Write a 3-email cart recovery sequence. Include the abandoned products, social proof, and escalating urgency. Email 3 includes a 10% discount code.", "model": "auto"}}},
    {"id": "4", "type": "api_call", "data": {"label": "Send Recovery Emails", "config": {"endpoint": "email_provider", "delays": ["1h", "24h", "48h"]}}},
    {"id": "5", "type": "ai_call", "data": {"label": "Personalized Product Recommendations", "config": {"prompt": "Based on the product viewed and browsing history, recommend 3-5 complementary products with brief personalized reasons why they'd like each one.", "model": "auto"}}},
    {"id": "6", "type": "ai_call", "data": {"label": "Post-Purchase Upsell + Review Request", "config": {"prompt": "Write a post-purchase email: thank the customer, suggest complementary products based on their order, and include a review request with a simple 1-5 star CTA.", "model": "auto"}}},
    {"id": "7", "type": "ai_call", "data": {"label": "Generate AI Product Descriptions", "config": {"prompt": "Write SEO-optimized product descriptions for new products. Include features, benefits, use cases, and specifications. Compelling but honest.", "model": "auto"}}},
    {"id": "8", "type": "ai_call", "data": {"label": "Auto-Respond to Reviews", "config": {"prompt": "Draft a response to this customer review. If positive: thank them genuinely. If negative: acknowledge, apologize, offer solution. Always professional and human.", "model": "auto"}}},
    {"id": "9", "type": "transform", "data": {"label": "Revenue Dashboard Update", "config": {"metrics": ["recovered_carts", "upsell_revenue", "review_score", "email_revenue"]}}}
  ],
  "edges": [
    {"from": "1", "to": "2"}, {"from": "2", "to": "3"}, {"from": "3", "to": "4"},
    {"from": "2", "to": "5"}, {"from": "2", "to": "6"}, {"from": "5", "to": "9"},
    {"from": "6", "to": "7"}, {"from": "7", "to": "9"}, {"from": "2", "to": "8"},
    {"from": "8", "to": "9"}, {"from": "4", "to": "9"}
  ]
}
```

### Workflow 9: AI Customer Support Bot ($12.99)
**Price:** $12.99
**Category:** support
**ROI:** 290-370% ROI, resolves 80% of queries automatically, 14-30 day payback

**Description:** AI support agent that handles 80% of customer queries automatically. Ingests your knowledge base, answers questions accurately, escalates complex issues, and learns from every interaction. Replaces $45-65K/yr support hire.

**Template:**
```json
{
  "nodes": [
    {"id": "1", "type": "trigger", "data": {"label": "Customer Message Received", "config": {"channels": ["chat_widget", "email", "social"]}}},
    {"id": "2", "type": "ai_call", "data": {"label": "Classify Intent", "config": {"prompt": "Classify this customer message into one of: product_question, order_status, complaint, refund_request, technical_issue, general_inquiry, spam. Also rate urgency 1-5.", "model": "auto"}}},
    {"id": "3", "type": "conditional", "data": {"label": "Needs Human?", "config": {"condition": "urgency >= 4 OR intent == complaint OR intent == refund_request", "trueBranch": "7", "falseBranch": "4"}}},
    {"id": "4", "type": "ai_call", "data": {"label": "Search Knowledge Base", "config": {"prompt": "Search the knowledge base for information relevant to this query. Find the most helpful answer, include specific details, links, and steps.", "model": "auto"}}},
    {"id": "5", "type": "ai_call", "data": {"label": "Generate Response", "config": {"prompt": "Write a helpful, friendly customer support response based on the knowledge base results. Be specific, include steps if needed, and ask if they need anything else. Match brand voice.", "model": "auto"}}},
    {"id": "6", "type": "api_call", "data": {"label": "Send Response", "config": {"endpoint": "support_channel", "method": "reply"}}},
    {"id": "7", "type": "api_call", "data": {"label": "Escalate to Human Agent", "config": {"endpoint": "helpdesk", "action": "create_ticket", "priority": "based_on_urgency"}}},
    {"id": "8", "type": "transform", "data": {"label": "Log & Learn", "config": {"action": "update_knowledge_base_with_resolution"}}}
  ],
  "edges": [
    {"from": "1", "to": "2"}, {"from": "2", "to": "3"}, {"from": "3", "to": "4"},
    {"from": "3", "to": "7"}, {"from": "4", "to": "5"}, {"from": "5", "to": "6"},
    {"from": "6", "to": "8"}, {"from": "7", "to": "8"}
  ]
}
```

### Workflow 10: AI Competitor Intelligence Monitor ($14.99)
**Price:** $14.99
**Category:** business
**ROI:** First-mover advantage on market shifts, daily automated intel reports

**Description:** Daily automated competitor monitoring. Tracks competitor websites, social media, pricing changes, job postings (signals growth/pivot), news mentions, and product updates. AI synthesizes everything into a morning briefing. Your team starts every day knowing exactly what competitors are doing.

**Template:**
```json
{
  "nodes": [
    {"id": "1", "type": "trigger", "data": {"label": "Daily Morning Run", "config": {"cron": "0 7 * * 1-5"}}},
    {"id": "2", "type": "api_call", "data": {"label": "Fetch Competitor Updates", "config": {"sources": ["competitor_websites", "rss_feeds", "google_news", "social_media", "job_boards"]}}},
    {"id": "3", "type": "ai_call", "data": {"label": "Analyze Changes", "config": {"prompt": "Analyze all competitor updates from the last 24 hours. Identify: pricing changes, new product features, marketing campaigns, hiring signals (what roles = what they're building), PR/news mentions, and social media strategy shifts.", "model": "auto"}}},
    {"id": "4", "type": "ai_call", "data": {"label": "Threat & Opportunity Assessment", "config": {"prompt": "Based on the competitor analysis, identify: 1) Direct threats to our business 2) Opportunities they're missing that we can capture 3) Trends across multiple competitors suggesting market shift. Rate each finding by urgency (high/medium/low).", "model": "auto"}}},
    {"id": "5", "type": "ai_call", "data": {"label": "Generate Morning Briefing", "config": {"prompt": "Create a concise executive briefing (max 500 words). Lead with the most important finding. Use bullet points. Include recommended actions for each insight. End with a 1-sentence market sentiment summary.", "model": "auto"}}},
    {"id": "6", "type": "api_call", "data": {"label": "Distribute Report", "config": {"channels": ["email", "slack"], "recipients": "configurable"}}},
    {"id": "7", "type": "transform", "data": {"label": "Update Competitor Dashboard", "config": {"action": "append_to_intelligence_log"}}}
  ],
  "edges": [
    {"from": "1", "to": "2"}, {"from": "2", "to": "3"}, {"from": "3", "to": "4"},
    {"from": "4", "to": "5"}, {"from": "5", "to": "6"}, {"from": "6", "to": "7"}
  ]
}
```

---

## SEEDING LOGIC

In `server/seed-workflows.ts`, create a function that:

1. Checks if workflows already exist (by name) to avoid duplicates
2. For each workflow, creates:
   - A `marketplace_listings` record with: `sellerId: 1` (owner), `title`, `description`, `category`, `priceCents`, `priceType` ("free" or "one_time"), `listingType: "workflow"`, `isPublished: 1`, `attachedItemData` (the template JSON stringified), plus ROI stats in the description
   - A `workflow_presets` record with: `name`, `description`, `category`, `templateData` (the nodes/edges JSON), `productId: null` for free ones
3. Uses INSERT OR IGNORE to be idempotent

Call this function at the end of storage.ts initialization.

## FRONTEND

In `WorkflowsPage.tsx`, ensure the templates section shows these workflows:
- Free ones: directly usable, "Use Template" button
- Paid ones: show price badge, "Buy" button → Stripe checkout → on success, template becomes usable
- Each card shows: name, description, ROI stat badge, price, category tag

In `MarketplacePage.tsx`, these should appear as regular listings that users can browse and purchase.

## GIT
After ALL changes: `git add -A && git commit -m "feat: seed 10 premium automation workflows — 2 free, 8 paid ($12.99-$19.99) with proven ROI data"`

Do NOT push — parent handles push.
