#!/usr/bin/env python3
"""
Delivery Pipeline Multi-Agent Review Script

Calls GPT and Gemini APIs for specification/security review of delivery phases.

Usage:
    python review_phase.py <phase_number> --plan <plan_file>

Environment:
    GEMINI_API_KEY - Google AI Studio API key
    OPENAI_API_KEY - OpenAI API key

Output:
    docs/ai-reviews/phase<N>-gpt-review.md
    docs/ai-reviews/phase<N>-gemini-review.md
"""

import os
import json
import sys
import argparse
from datetime import datetime
from pathlib import Path

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
REVIEWS_DIR = PROJECT_ROOT / "docs" / "ai-reviews"

# Ensure reviews directory exists
REVIEWS_DIR.mkdir(parents=True, exist_ok=True)

GPT_SYSTEM_PROMPT = """You are GPT-5.2, a senior software architect reviewing delivery/CI-CD pipeline changes.

Your role is SPECIFICATION CORRECTNESS:
- Validate that the proposed changes align with stated goals
- Check Definition of Done criteria are clear and measurable
- Verify CI/CD best practices are followed
- Confirm migration strategies are safe
- Flag any ambiguous requirements

Format your response as:
## Specification Review Summary
[1-2 sentence overall assessment]

## Correctness Analysis
[Point-by-point review of each proposed change]

## Definition of Done Gaps
[Any missing acceptance criteria]

## CI/CD Best Practices
[Alignment with industry standards]

## Recommendations
[Specific, actionable improvements]

## Approval Status
[APPROVED / APPROVED WITH CONDITIONS / NEEDS REVISION]
"""

GEMINI_SYSTEM_PROMPT = """You are Gemini 3, a senior security and reliability engineer reviewing delivery/CI-CD pipeline changes.

Your role is SECURITY AND OPS RISK ANALYSIS:
- Identify secrets management risks
- Assess blast radius of proposed changes
- Review deployment safety mechanisms
- Flag reliability concerns
- Evaluate rollback capabilities

Format your response as:
## Security & Ops Review Summary
[1-2 sentence overall assessment]

## Security Analysis
[Secrets handling, access control, exposure risks]

## Blast Radius Assessment
[Impact scope if changes fail]

## Reliability Concerns
[Single points of failure, recovery paths]

## Risk Matrix
| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
[Table of identified risks]

## Recommendations
[Specific, actionable security improvements]

## Approval Status
[APPROVED / APPROVED WITH CONDITIONS / NEEDS REVISION]
"""


def call_gemini(plan_content: str, phase: int) -> tuple[str, dict]:
    """Call Gemini API with plan content."""
    import google.generativeai as genai

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable not set")

    genai.configure(api_key=api_key)

    # Use Gemini 2.0 Flash (latest available)
    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash-exp",
        system_instruction=GEMINI_SYSTEM_PROMPT
    )

    prompt = f"""# Phase {phase} Delivery Plan Review Request

Please review this delivery phase plan for security and operational risks.

---

{plan_content}

---

Provide your security and ops risk analysis."""

    start_time = datetime.now()
    response = model.generate_content(prompt)
    end_time = datetime.now()

    metadata = {
        "model": "gemini-2.0-flash-exp",
        "role": "Security & Ops Risk Analysis",
        "timestamp": start_time.isoformat(),
        "duration_seconds": (end_time - start_time).total_seconds(),
    }

    return response.text, metadata


def call_gpt(plan_content: str, phase: int) -> tuple[str, dict]:
    """Call OpenAI GPT API with plan content."""
    from openai import OpenAI

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable not set")

    client = OpenAI(api_key=api_key)

    user_prompt = f"""# Phase {phase} Delivery Plan Review Request

Please review this delivery phase plan for specification correctness and CI/CD best practices.

---

{plan_content}

---

Provide your specification review."""

    start_time = datetime.now()
    response = client.chat.completions.create(
        model="gpt-4o",  # Using gpt-4o as GPT-5.2 equivalent
        messages=[
            {"role": "system", "content": GPT_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.3,
        max_tokens=4096
    )
    end_time = datetime.now()

    metadata = {
        "model": "gpt-4o",
        "role": "Specification Correctness",
        "timestamp": start_time.isoformat(),
        "duration_seconds": (end_time - start_time).total_seconds(),
        "prompt_tokens": response.usage.prompt_tokens,
        "completion_tokens": response.usage.completion_tokens,
        "total_tokens": response.usage.total_tokens,
    }

    return response.choices[0].message.content, metadata


def format_output(content: str, model_name: str, role: str, phase: int, metadata: dict) -> str:
    """Format the model output with metadata header."""
    return f"""# Phase {phase} {role} Review
## {model_name}

**Generated**: {metadata['timestamp']}
**Model**: {metadata['model']}
**Role**: {metadata['role']}
**Duration**: {metadata['duration_seconds']:.2f} seconds

---

{content}

---

*Generated by delivery pipeline multi-agent review*
"""


def main():
    parser = argparse.ArgumentParser(description="Run multi-agent review on delivery phase plan")
    parser.add_argument("phase", type=int, help="Phase number (0-3)")
    parser.add_argument("--plan", required=True, help="Path to plan markdown file")
    parser.add_argument("--gpt-only", action="store_true", help="Only run GPT review")
    parser.add_argument("--gemini-only", action="store_true", help="Only run Gemini review")
    args = parser.parse_args()

    plan_path = Path(args.plan)
    if not plan_path.exists():
        print(f"ERROR: Plan file not found: {plan_path}")
        sys.exit(1)

    plan_content = plan_path.read_text()

    print("=" * 60)
    print(f"Multi-Agent Review: Phase {args.phase} Plan")
    print("=" * 60)
    print(f"Plan file: {plan_path}")
    print(f"Plan size: {len(plan_content)} chars")

    results = {}

    # Call GPT
    if not args.gemini_only:
        print("\n" + "-" * 40)
        print("Calling GPT (Specification Correctness)...")
        try:
            gpt_response, gpt_meta = call_gpt(plan_content, args.phase)
            gpt_output = format_output(gpt_response, "GPT", "Specification", args.phase, gpt_meta)
            gpt_file = REVIEWS_DIR / f"phase{args.phase}-gpt-review.md"
            gpt_file.write_text(gpt_output)
            results["gpt"] = {"status": "success", "file": str(gpt_file), **gpt_meta}
            print(f"✓ GPT review complete ({gpt_meta['duration_seconds']:.2f}s)")
            print(f"  Output: {gpt_file.relative_to(PROJECT_ROOT)}")
        except Exception as e:
            print(f"✗ GPT error: {e}")
            results["gpt"] = {"status": "error", "error": str(e)}

    # Call Gemini
    if not args.gpt_only:
        print("\n" + "-" * 40)
        print("Calling Gemini (Security & Ops Risk)...")
        try:
            gemini_response, gemini_meta = call_gemini(plan_content, args.phase)
            gemini_output = format_output(gemini_response, "Gemini", "Security & Ops", args.phase, gemini_meta)
            gemini_file = REVIEWS_DIR / f"phase{args.phase}-gemini-review.md"
            gemini_file.write_text(gemini_output)
            results["gemini"] = {"status": "success", "file": str(gemini_file), **gemini_meta}
            print(f"✓ Gemini review complete ({gemini_meta['duration_seconds']:.2f}s)")
            print(f"  Output: {gemini_file.relative_to(PROJECT_ROOT)}")
        except Exception as e:
            print(f"✗ Gemini error: {e}")
            results["gemini"] = {"status": "error", "error": str(e)}

    # Summary
    print("\n" + "=" * 60)
    print("REVIEW SUMMARY")
    print("=" * 60)
    for name, data in results.items():
        status = "✓" if data["status"] == "success" else "✗"
        print(f"  {status} {name}: {data.get('file', data.get('error', 'unknown'))}")

    # Return non-zero if any review failed
    if any(r["status"] == "error" for r in results.values()):
        sys.exit(1)


if __name__ == "__main__":
    main()
