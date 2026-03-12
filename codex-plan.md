  # OpenClaw Job Apply POC                                                                                                                       
                                                                                                                                                 
  ## Summary                                                                                                                                     
                                                                                                                                                 
  - Draft target: prompts/openclaw-discord-job-apply-poc.md                                                                                      
  - Build openclaw as a greenfield system that ingests job-alert emails, filters roles for a candidate in Toronto at M1E 4V4, routes review      
    through a dedicated Discord server, selects the best existing resume variant, and drafts application materials.                              
  - Use Discord as the full operator interface and an external DB as the source of truth.                                                        
  - Keep final submission manual in v1. The POC may ingest, score, shortlist, organize Discord, and draft content, but it should not directly    
    auto-submit on LinkedIn or Indeed.                                                                                                           
                                                                                                                                                 
  ## What OpenClaw Is                                                                                                                            
                                                                                                                                                 
  - A job-ingestion pipeline for Indeed and LinkedIn alert emails sent to a dedicated inbox.                                                     
  - A JD analysis layer that extracts title, location, work model, skills, seniority, compensation, risk flags, and duplicate fingerprints.      
  - A resume-matching layer that maps each job to an existing resume variant from resume-data.ts and the PDFs in public/resume.                  
  - A drafting layer that produces a rationale, tailored summary, cover letter text, and screener-answer drafts without inventing experience.    
  - A Discord bot that manages a dedicated server, creates review threads, exposes slash commands, and tracks operator actions.                  
                                                                                                                                                 
  ## Core Rules                                                                                                                                  
                                                                                                                                                 
  - Accept remote only if the posting is explicitly valid for Canada.                                                                            
  - Accept hybrid only if the office is within < 20 km of M1E 4V4.                                                                               
  - Accept on-site only if the office is within < 20 km of M1E 4V4.                                                                              
  - If office location is vague or cannot be geocoded confidently, mark the job needs_review instead of auto-accepting.                          
  - Target job families: SWE, web, Python, cloud, IT support, call centre, and customer support.                                                 
  - Reject or down-rank U.S.-only remote roles, seniority mismatches, staffing spam, duplicate listings, suspicious postings, and jobs that      
    require facts not supported by the resume set.       

 ## Workflow                                                                                                                                    
                                                                                                                                                 
  1. Poll a dedicated inbox for Indeed and LinkedIn alert emails.                                                                                
  2. Parse each alert into a normalized JobLead and dedupe by company, title, location, and canonical URL fingerprint.                           
  3. Fetch fuller posting content only after the job survives initial filtering.                                                                 
  4. Score fit by JD content, location policy, job family, seniority, and scam/risk signals.                                                     
  5. Choose a resume lane:                                                                                                                       
      - SWE/cloud: web-dev, web-dev-django, python, aws, aws-web-dev, aws-python                                                                 
      - Support/customer-facing: call-centre, it-support, it-support-sql, it-support-aws, sales                                                  
  6. Generate ResumeMatch and ApplicationDraft.                                                                                                  
  7. Post shortlisted jobs into Discord, create a per-job thread, and wait for operator commands.                                                
  8. On Discord approval, move the job to approved_for_manual_apply and preserve the draft packet for manual submission.                         
                                                                                                                                                 
  ## Key Interfaces                                                                                                                              
                                                                                                                                                 
  - JobLead: source, email_metadata, company, title, work_model, location_raw, office_location_raw, office_address_normalized, office_lat_lng,   
    distance_km, location_confidence, location_decision, canada_eligible, urls, normalized_description, compensation, seniority,                 
    employment_type, duplicate_key, risk_flags                                                                                                   
  - ResumeMatch: variant_id, pdf_filename, fit_score, match_reasons, missing_requirements, rejection_reasons                                     
  - ApplicationDraft: chosen_resume, rationale, tailored_summary, cover_letter_draft, screener_answer_drafts, recommendation                     
  - ReviewQueueItem: status, blockers, timestamps, operator_actions, discord_refs   

  ## Discord Server Design                                                                                                                       
                                                                                                                                                 
  - Single-user dedicated server.                                                                                                                
  - Bot has admin rights, but should only manage bot-owned categories and threads by default.                                                    
  - Managed categories: openclaw-inbox, openclaw-review, openclaw-approved, openclaw-applied, openclaw-admin.                                    
  - Use status channels plus per-job threads instead of one channel per job.                                                                     
  - Slash commands: /jobs new, /jobs shortlist, /job <id>, /approve-draft <id>, /reject <id>, /note <id>, /apply-status <id>, /resume-choice     
    <id>.                                                                                                                                        
  - Each job thread should show the JD summary, work model, office distance if applicable, chosen resume, fit score, risk flags, and drafted     
    materials.                                                                                                                                   
                                                                                                                                                 
  ## Test Plan                                                                                                                                   
                                                                                                                                                 
  - Parse sample Indeed and LinkedIn alert emails into valid JobLead records.                                                                    
  - Deduplicate the same role across multiple alerts and sources.                                                                                
  - Verify location rules for Canada-eligible remote, nearby hybrid, nearby on-site, far hybrid/on-site, vague office location, and U.S.-only    
    remote cases.                                                                                                                                
  - Verify resume routing for support/call-centre roles and Django/Python SWE roles.                                                             
  - Verify Discord provisioning creates the managed categories and job threads correctly.                                                        
  - Verify /approve-draft changes status to approved_for_manual_apply and /reject prevents resurfacing duplicates.                               
  - Verify Discord state can be rebuilt from the external DB if a thread or message is removed.                                                  
                                                                                                                                                 
  ## Assumptions                                                                                                                                 
                                                                                                                                                 
  - Dedicated alert inbox.                                                                                                                       
  - Discord is the full control plane.                                                                                                           
  - Private single-user server.                                                                                                                  
  - Text chat plus slash commands, not voice.                                                                                                    
  - External DB is the canonical system of record.                                                                                               
  - Final submission remains manual in the first POC.         
