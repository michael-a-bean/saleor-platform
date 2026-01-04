#!/usr/bin/env python3
"""Create legal pages in Saleor CMS."""

import json
import urllib.request

API_URL = "http://localhost:8000/graphql/"
PAGE_TYPE_ID = "UGFnZVR5cGU6MQ=="

def graphql_request(query, variables=None, token=None):
    """Make a GraphQL request."""
    data = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(API_URL, data=data, headers=headers)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def get_token():
    """Get auth token."""
    query = '''
    mutation {
        tokenCreate(email: "admin@example.com", password: "admin") {
            token
            errors { message }
        }
    }
    '''
    result = graphql_request(query)
    return result["data"]["tokenCreate"]["token"]

def create_page(token, title, slug, content_blocks):
    """Create a page."""
    query = '''
    mutation CreatePage($input: PageCreateInput!) {
        pageCreate(input: $input) {
            page { id title slug }
            errors { field message }
        }
    }
    '''
    content = json.dumps({"blocks": content_blocks})
    variables = {
        "input": {
            "title": title,
            "slug": slug,
            "pageType": PAGE_TYPE_ID,
            "isPublished": True,
            "content": content
        }
    }
    return graphql_request(query, variables, token)

def main():
    print("Getting auth token...")
    token = get_token()
    print("Token obtained")

    pages = [
        {
            "title": "Privacy Policy",
            "slug": "privacy-policy",
            "blocks": [
                {"type": "header", "data": {"text": "Privacy Policy", "level": 1}},
                {"type": "paragraph", "data": {"text": "Last updated: January 2026"}},
                {"type": "header", "data": {"text": "Information We Collect", "level": 2}},
                {"type": "paragraph", "data": {"text": "We collect information you provide directly to us when you create an account, make a purchase, or contact us. This includes your name, email, shipping address, and payment information."}},
                {"type": "header", "data": {"text": "How We Use Your Information", "level": 2}},
                {"type": "paragraph", "data": {"text": "We use your information to process orders, send confirmations, respond to inquiries, and improve our services."}},
                {"type": "header", "data": {"text": "Cookies", "level": 2}},
                {"type": "paragraph", "data": {"text": "We use cookies to save preferences and analyze site traffic. You can control cookies through your browser settings."}},
                {"type": "header", "data": {"text": "Your Rights", "level": 2}},
                {"type": "paragraph", "data": {"text": "You may access, correct, or delete your personal information by contacting us."}},
                {"type": "header", "data": {"text": "Contact", "level": 2}},
                {"type": "paragraph", "data": {"text": "Questions about this policy? Visit our Contact page."}}
            ]
        },
        {
            "title": "Terms of Service",
            "slug": "terms-of-service",
            "blocks": [
                {"type": "header", "data": {"text": "Terms of Service", "level": 1}},
                {"type": "paragraph", "data": {"text": "Last updated: January 2026"}},
                {"type": "header", "data": {"text": "Acceptance of Terms", "level": 2}},
                {"type": "paragraph", "data": {"text": "By using this website, you agree to these Terms of Service. If you disagree, please do not use our site."}},
                {"type": "header", "data": {"text": "Products and Pricing", "level": 2}},
                {"type": "paragraph", "data": {"text": "Prices are subject to change without notice. We reserve the right to modify or discontinue products at any time."}},
                {"type": "header", "data": {"text": "Orders and Payment", "level": 2}},
                {"type": "paragraph", "data": {"text": "We may refuse or cancel orders for any reason, including pricing errors. Payment is due at time of purchase."}},
                {"type": "header", "data": {"text": "Shipping", "level": 2}},
                {"type": "paragraph", "data": {"text": "Shipping times are estimates. We are not responsible for carrier delays. Risk passes to buyer upon shipment."}},
                {"type": "header", "data": {"text": "Returns", "level": 2}},
                {"type": "paragraph", "data": {"text": "See our Return Policy page for return and refund information."}},
                {"type": "header", "data": {"text": "Limitation of Liability", "level": 2}},
                {"type": "paragraph", "data": {"text": "We are not liable for indirect, incidental, or consequential damages from use of our website or products."}},
                {"type": "header", "data": {"text": "Changes", "level": 2}},
                {"type": "paragraph", "data": {"text": "We may update these terms at any time. Continued use constitutes acceptance."}}
            ]
        },
        {
            "title": "Return Policy",
            "slug": "return-policy",
            "blocks": [
                {"type": "header", "data": {"text": "Return Policy", "level": 1}},
                {"type": "paragraph", "data": {"text": "Last updated: January 2026"}},
                {"type": "header", "data": {"text": "Return Window", "level": 2}},
                {"type": "paragraph", "data": {"text": "Returns accepted within 30 days of delivery. Items must be unused and in original packaging."}},
                {"type": "header", "data": {"text": "Non-Returnable Items", "level": 2}},
                {"type": "paragraph", "data": {"text": "Opened trading card products, damaged items (unless shipping damage), custom orders, and final sale items cannot be returned."}},
                {"type": "header", "data": {"text": "How to Return", "level": 2}},
                {"type": "paragraph", "data": {"text": "Contact us with your order number and reason for return. We will provide return instructions."}},
                {"type": "header", "data": {"text": "Refunds", "level": 2}},
                {"type": "paragraph", "data": {"text": "Approved refunds processed to original payment method within 5-10 business days after inspection."}},
                {"type": "header", "data": {"text": "Shipping", "level": 2}},
                {"type": "paragraph", "data": {"text": "Return shipping is customer responsibility unless return is due to our error. Use trackable shipping."}},
                {"type": "header", "data": {"text": "Damaged Items", "level": 2}},
                {"type": "paragraph", "data": {"text": "Report damaged items within 48 hours with photos. We will replace or refund including shipping."}},
                {"type": "header", "data": {"text": "Questions", "level": 2}},
                {"type": "paragraph", "data": {"text": "Contact us through our Contact page for return questions."}}
            ]
        }
    ]

    for page in pages:
        print(f"Creating {page['title']}...")
        result = create_page(token, page["title"], page["slug"], page["blocks"])
        if result.get("data", {}).get("pageCreate", {}).get("errors"):
            errors = result["data"]["pageCreate"]["errors"]
            if errors:
                print(f"  Error: {errors}")
            else:
                page_data = result["data"]["pageCreate"]["page"]
                print(f"  Created: {page_data['slug']} (ID: {page_data['id']})")
        elif result.get("data", {}).get("pageCreate", {}).get("page"):
            page_data = result["data"]["pageCreate"]["page"]
            print(f"  Created: {page_data['slug']} (ID: {page_data['id']})")
        else:
            print(f"  Response: {result}")

    print("\nDone!")

if __name__ == "__main__":
    main()
