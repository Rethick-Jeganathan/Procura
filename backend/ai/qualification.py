"""
AI Qualification Engine
Scores opportunities using LLM for Fit, Effort, and Urgency
"""
from typing import Dict, Optional
from datetime import datetime, date
import structlog

from .llm_client import LLMClient, get_llm_client
from ..database import get_supabase_client

logger = structlog.get_logger()

QUALIFICATION_PROMPT = """Analyze this government contract opportunity and provide qualification scores.

**Opportunity Details:**
- Title: {title}
- Agency: {agency}
- Description: {description}
- NAICS Code: {naics_code}
- Set-Aside: {set_aside}
- Posted Date: {posted_date}
- Due Date: {due_date}
- Estimated Value: ${estimated_value}

**Scoring Criteria:**

1. **Fit Score (0-100)**: How well does this opportunity align with typical IT services, software development, cloud infrastructure, or consulting capabilities?
   - 80-100: Perfect fit - direct match to core capabilities
   - 60-79: Good fit - related to core capabilities
   - 40-59: Moderate fit - some relevant capabilities
   - 0-39: Poor fit - outside typical capabilities

2. **Effort Score (0-100)**: How complex and resource-intensive is this opportunity?
   - 80-100: Very high effort - large team, long timeline, complex requirements
   - 60-79: High effort - significant resources needed
   - 40-59: Moderate effort - standard project size
   - 0-39: Low effort - small, straightforward project

3. **Urgency Score (0-100)**: How time-sensitive is the deadline?
   - 80-100: Critical - due within 7 days
   - 60-79: High urgency - due within 14 days
   - 40-59: Moderate - due within 30 days
   - 0-39: Low urgency - over 30 days

Respond with ONLY valid JSON:
{{
  "fit_score": <number>,
  "effort_score": <number>,
  "urgency_score": <number>,
  "summary": "<2-3 sentence summary of why this is or isn't a good fit>",
  "reasoning": {{
    "fit": "<brief explanation>",
    "effort": "<brief explanation>",
    "urgency": "<brief explanation>"
  }}
}}
"""


async def qualify_opportunity(opportunity: Dict, force_refresh: bool = False) -> Dict:
    """
    Qualify an opportunity using AI analysis
    Returns scores and summary
    """
    supabase = get_supabase_client()
    opp_id = opportunity.get("id")
    
    # Check cache unless force refresh
    if not force_refresh and opp_id:
        try:
            cache = supabase.table("llm_cache").select("response").eq("opportunity_id", opp_id).execute()
            if cache.data:
                logger.info("Using cached qualification", opportunity_id=opp_id)
                return cache.data[0]["response"]
        except Exception as e:
            # RLS often blocks llm_cache writes/reads without a service role key in dev.
            logger.warning("LLM cache unavailable; continuing without cache", opportunity_id=opp_id, error=str(e)[:200])
    
    # Calculate days until due for urgency context
    due_date = opportunity.get("due_date")
    if isinstance(due_date, str):
        try:
            due_date = datetime.strptime(due_date, "%Y-%m-%d").date()
        except:
            due_date = None
    
    days_until_due = (due_date - date.today()).days if due_date else 30
    
    # Build prompt
    prompt = QUALIFICATION_PROMPT.format(
        title=opportunity.get("title", "Unknown"),
        agency=opportunity.get("agency", "Unknown"),
        description=opportunity.get("description", "No description provided")[:1000],
        naics_code=opportunity.get("naics_code", "Not specified"),
        set_aside=opportunity.get("set_aside", "None"),
        posted_date=opportunity.get("posted_date", "Unknown"),
        due_date=opportunity.get("due_date", "Unknown"),
        estimated_value=opportunity.get("estimated_value") or "Not specified"
    )
    
    try:
        llm = get_llm_client()
        result = await llm.analyze_json(prompt)
        
        # Validate scores are in range
        for key in ["fit_score", "effort_score", "urgency_score"]:
            if key in result:
                result[key] = max(0, min(100, int(result[key])))
        
        # Cache result
        if opp_id:
            import hashlib
            prompt_hash = hashlib.sha256(prompt.encode()).hexdigest()
            try:
                supabase.table("llm_cache").insert({
                    "opportunity_id": opp_id,
                    "prompt_hash": prompt_hash,
                    "provider": llm.provider,
                    "model": llm.model,
                    "response": result
                }).execute()
            except Exception as e:
                logger.warning("Failed to write llm_cache; continuing", opportunity_id=opp_id, error=str(e)[:200])
        
        logger.info("Opportunity qualified", opportunity_id=opp_id, scores=result)
        return result
        
    except Exception as e:
        logger.error("Qualification failed", opportunity_id=opp_id, error=str(e))
        # Return default scores on failure
        return {
            "fit_score": 50,
            "effort_score": 50,
            "urgency_score": max(0, min(100, 100 - days_until_due * 3)),
            "summary": "AI qualification unavailable - scores are estimates",
            "reasoning": {"error": str(e)}
        }
