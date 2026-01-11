#!/usr/bin/env python3
"""
AI Review Script - Calls GPT-5.2 and Gemini 3 for infrastructure review.

Usage:
    python ai-review.py <input_file> [--gpt-only | --gemini-only]
"""

import os
import sys
import argparse
from datetime import datetime
from pathlib import Path

def call_gpt(prompt: str, system_prompt: str) -> str:
    """Call GPT-5.2 for correctness/spec review."""
    import openai

    client = openai.OpenAI()

    response = client.chat.completions.create(
        model="gpt-5.2",  # GPT-5.2 as specified
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        temperature=0.3,
        max_completion_tokens=4096
    )

    return response.choices[0].message.content


def call_gemini(prompt: str, system_prompt: str) -> str:
    """Call Gemini 3 for security/ops review."""
    import google.generativeai as genai

    genai.configure()  # Uses GOOGLE_API_KEY env var

    model = genai.GenerativeModel(
        model_name="gemini-3-pro-preview",  # Gemini 3 Pro Preview
        system_instruction=system_prompt
    )

    response = model.generate_content(prompt)
    return response.text


def main():
    parser = argparse.ArgumentParser(description="AI Review Script")
    parser.add_argument("input_file", help="Input markdown file to review")
    parser.add_argument("--gpt-only", action="store_true", help="Only run GPT review")
    parser.add_argument("--gemini-only", action="store_true", help="Only run Gemini review")
    args = parser.parse_args()

    # Read input file
    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    content = input_path.read_text()
    timestamp = datetime.now().isoformat(timespec='seconds')

    # GPT-5.2 Review - Correctness/Spec
    gpt_system = """You are a senior infrastructure engineer reviewing AWS ECS/Fargate deployment configurations.

Focus on:
1. Correctness of GitHub Actions workflow dependencies and job ordering
2. Terraform module structure and variable consistency
3. Migration ordering and safety (Django vs Prisma)
4. ECS task definition and service configuration accuracy
5. Image promotion semantics (staging to production)

Provide specific, actionable feedback. Reference line numbers and file paths when applicable.
Output in markdown format with clear sections."""

    # Gemini 3 Review - Security/Ops
    gemini_system = """You are a cloud security architect reviewing AWS deployment infrastructure.

Focus on:
1. IAM policy scope and least-privilege adherence
2. OIDC trust policy security (no overly broad conditions)
3. Network boundary enforcement (security groups, private subnets)
4. Secret handling (SSM, no plaintext exposure)
5. Backup and rollback procedures adequacy

Identify security risks and operational concerns. Provide specific mitigations.
Output in markdown format with severity ratings (CRITICAL/HIGH/MEDIUM/LOW)."""

    review_prompt = f"""Please review the following AWS ECS/Fargate deployment pre-flight validation plan.

{content}

Provide your detailed review with:
1. Confirmation of correctly identified issues
2. Any additional issues or risks missed
3. Assessment of proposed fixes
4. Specific recommendations for improvement
"""

    results = {}

    # Run GPT review
    if not args.gemini_only:
        print("Calling GPT-5.2 for correctness review...", file=sys.stderr)
        try:
            results['gpt'] = call_gpt(review_prompt, gpt_system)
            print("GPT-5.2 review complete.", file=sys.stderr)
        except Exception as e:
            results['gpt'] = f"Error calling GPT-5.2: {e}"
            print(f"GPT-5.2 error: {e}", file=sys.stderr)

    # Run Gemini review
    if not args.gpt_only:
        print("Calling Gemini 3 for security review...", file=sys.stderr)
        try:
            results['gemini'] = call_gemini(review_prompt, gemini_system)
            print("Gemini 3 review complete.", file=sys.stderr)
        except Exception as e:
            results['gemini'] = f"Error calling Gemini 3: {e}"
            print(f"Gemini 3 error: {e}", file=sys.stderr)

    # Output combined results
    output = f"""# Pre-Flight Validation AI Review

**Generated**: {timestamp}
**Input**: {input_path.name}

---

"""

    if 'gpt' in results:
        output += f"""## GPT-5.2 Review (Correctness/Spec)

{results['gpt']}

---

"""

    if 'gemini' in results:
        output += f"""## Gemini 3 Review (Security/Ops)

{results['gemini']}

---

"""

    output += """## Summary

Review completed. Please address any HIGH or CRITICAL findings before proceeding with deployment.
"""

    print(output)


if __name__ == "__main__":
    main()
