#!/usr/bin/env python3
"""
Crowdsource AI Analysis Script

Calls Gemini and GPT APIs with the context brief to get external
feature-gap analysis for the Saleor hobby gaming platform.

Usage:
    python crowdsource_models.py

Environment:
    GEMINI_API_KEY - Google AI Studio API key
    OPENAI_API_KEY - OpenAI API key

Output:
    docs/research/gemini_deep_research.md
    docs/research/gpt_deep_research.md
    docs/research/run_manifest.json
"""

import os
import json
import sys
from datetime import datetime
from pathlib import Path

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
RESEARCH_DIR = PROJECT_ROOT / "docs" / "research"
CONTEXT_BRIEF = RESEARCH_DIR / "context_brief.md"
EVIDENCE_INDEX = RESEARCH_DIR / "evidence_index.md"

# Output files
GEMINI_OUTPUT = RESEARCH_DIR / "gemini_deep_research.md"
GPT_OUTPUT = RESEARCH_DIR / "gpt_deep_research.md"
MANIFEST_OUTPUT = RESEARCH_DIR / "run_manifest.json"


def load_context():
    """Load context brief and evidence index."""
    context_brief = CONTEXT_BRIEF.read_text()
    evidence_index = EVIDENCE_INDEX.read_text()
    return context_brief, evidence_index


SYSTEM_PROMPT = """You are a senior software architect specializing in e-commerce platforms and retail systems.
You're reviewing a hobby gaming (Magic: The Gathering card) commerce platform built on Saleor.

Analyze the provided context and give your expert assessment on:
1. Additional feature gaps not mentioned
2. Priority ranking of what to build next (with reasoning)
3. Implementation recommendations for top 3 priorities
4. Risk assessment if gaps aren't addressed
5. Alternative architectures or tools to consider

Be specific, actionable, and consider the unique aspects of secondary market card sales (condition grading, market-driven pricing, buyback from customers).

Format your response in markdown with clear sections."""


def call_gemini(context_brief: str, evidence_index: str) -> tuple[str, dict]:
    """Call Gemini API with context."""
    import google.generativeai as genai

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable not set")

    genai.configure(api_key=api_key)

    # Use Gemini 2.0 Flash for best performance
    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash-exp",
        system_instruction=SYSTEM_PROMPT
    )

    prompt = f"""# Context Brief

{context_brief}

---

# Supporting Evidence

{evidence_index}

---

Please provide your comprehensive feature-gap analysis and roadmap recommendations."""

    start_time = datetime.now()
    response = model.generate_content(prompt)
    end_time = datetime.now()

    metadata = {
        "model": "gemini-2.0-flash-exp",
        "timestamp": start_time.isoformat(),
        "duration_seconds": (end_time - start_time).total_seconds(),
        "prompt_tokens": model.count_tokens(prompt).total_tokens,
    }

    return response.text, metadata


def call_gpt(context_brief: str, evidence_index: str) -> tuple[str, dict]:
    """Call OpenAI GPT API with context."""
    from openai import OpenAI

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable not set")

    client = OpenAI(api_key=api_key)

    user_prompt = f"""# Context Brief

{context_brief}

---

# Supporting Evidence

{evidence_index}

---

Please provide your comprehensive feature-gap analysis and roadmap recommendations."""

    start_time = datetime.now()
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.7,
        max_tokens=4096
    )
    end_time = datetime.now()

    metadata = {
        "model": "gpt-4o",
        "timestamp": start_time.isoformat(),
        "duration_seconds": (end_time - start_time).total_seconds(),
        "prompt_tokens": response.usage.prompt_tokens,
        "completion_tokens": response.usage.completion_tokens,
        "total_tokens": response.usage.total_tokens,
    }

    return response.choices[0].message.content, metadata


def format_output(content: str, model_name: str, metadata: dict) -> str:
    """Format the model output with metadata header."""
    header = f"""# {model_name} Deep Research Analysis
## Saleor Platform for Hobby Gaming Commerce

**Generated**: {metadata['timestamp']}
**Model**: {metadata['model']}
**Duration**: {metadata['duration_seconds']:.2f} seconds

---

"""
    return header + content


def main():
    """Run the crowdsource analysis."""
    print("=" * 60)
    print("Crowdsource AI Analysis for Saleor Hobby Gaming Platform")
    print("=" * 60)

    # Check for API keys
    gemini_key = os.environ.get("GEMINI_API_KEY")
    openai_key = os.environ.get("OPENAI_API_KEY")

    if not gemini_key:
        print("ERROR: GEMINI_API_KEY not set")
        sys.exit(1)
    if not openai_key:
        print("ERROR: OPENAI_API_KEY not set")
        sys.exit(1)

    print(f"✓ GEMINI_API_KEY found ({len(gemini_key)} chars)")
    print(f"✓ OPENAI_API_KEY found ({len(openai_key)} chars)")

    # Load context
    print("\nLoading context brief and evidence index...")
    try:
        context_brief, evidence_index = load_context()
        print(f"✓ Context brief: {len(context_brief)} chars")
        print(f"✓ Evidence index: {len(evidence_index)} chars")
    except FileNotFoundError as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    manifest = {
        "run_timestamp": datetime.now().isoformat(),
        "context_brief_size": len(context_brief),
        "evidence_index_size": len(evidence_index),
        "models": {}
    }

    # Call Gemini
    print("\n" + "-" * 40)
    print("Calling Gemini 2.0 Flash...")
    try:
        gemini_response, gemini_meta = call_gemini(context_brief, evidence_index)
        gemini_output = format_output(gemini_response, "Gemini", gemini_meta)
        GEMINI_OUTPUT.write_text(gemini_output)
        manifest["models"]["gemini"] = {
            "status": "success",
            "output_file": str(GEMINI_OUTPUT.relative_to(PROJECT_ROOT)),
            **gemini_meta
        }
        print(f"✓ Gemini response received ({len(gemini_response)} chars)")
        print(f"  Duration: {gemini_meta['duration_seconds']:.2f}s")
        print(f"  Output: {GEMINI_OUTPUT.relative_to(PROJECT_ROOT)}")
    except Exception as e:
        print(f"✗ Gemini error: {e}")
        manifest["models"]["gemini"] = {
            "status": "error",
            "error": str(e)
        }

    # Call GPT
    print("\n" + "-" * 40)
    print("Calling GPT-4o...")
    try:
        gpt_response, gpt_meta = call_gpt(context_brief, evidence_index)
        gpt_output = format_output(gpt_response, "GPT-4o", gpt_meta)
        GPT_OUTPUT.write_text(gpt_output)
        manifest["models"]["gpt"] = {
            "status": "success",
            "output_file": str(GPT_OUTPUT.relative_to(PROJECT_ROOT)),
            **gpt_meta
        }
        print(f"✓ GPT-4o response received ({len(gpt_response)} chars)")
        print(f"  Duration: {gpt_meta['duration_seconds']:.2f}s")
        print(f"  Tokens: {gpt_meta['total_tokens']}")
        print(f"  Output: {GPT_OUTPUT.relative_to(PROJECT_ROOT)}")
    except Exception as e:
        print(f"✗ GPT-4o error: {e}")
        manifest["models"]["gpt"] = {
            "status": "error",
            "error": str(e)
        }

    # Write manifest
    MANIFEST_OUTPUT.write_text(json.dumps(manifest, indent=2))
    print("\n" + "-" * 40)
    print(f"✓ Manifest written: {MANIFEST_OUTPUT.relative_to(PROJECT_ROOT)}")

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    successful = sum(1 for m in manifest["models"].values() if m["status"] == "success")
    print(f"Models called: {len(manifest['models'])}")
    print(f"Successful: {successful}")
    print(f"\nOutput files:")
    for name, data in manifest["models"].items():
        status = "✓" if data["status"] == "success" else "✗"
        print(f"  {status} {name}: {data.get('output_file', data.get('error', 'unknown'))}")


if __name__ == "__main__":
    main()
