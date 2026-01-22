#!/bin/bash

# Get fresh token
echo "Getting auth token..."
TOKEN_RESPONSE=$(curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { tokenCreate(email: \"admin@example.com\", password: \"admin\") { token } }"}')

TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "Failed to get token"
  exit 1
fi
echo "Token obtained"

PAGE_TYPE="UGFnZVR5cGU6MQ=="

# Create Privacy Policy
echo "Creating Privacy Policy..."
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d @- << 'GRAPHQL'
{
  "query": "mutation CreatePage($input: PageCreateInput!) { pageCreate(input: $input) { page { id title slug } errors { field message } } }",
  "variables": {
    "input": {
      "title": "Privacy Policy",
      "slug": "privacy-policy",
      "pageType": "UGFnZVR5cGU6MQ==",
      "isPublished": true,
      "content": "{\"blocks\": [{\"type\": \"header\", \"data\": {\"text\": \"Privacy Policy\", \"level\": 1}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"Last updated: January 2026\"}}, {\"type\": \"header\", \"data\": {\"text\": \"Information We Collect\", \"level\": 2}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"We collect information you provide directly to us when you create an account, make a purchase, or contact us. This includes your name, email, shipping address, and payment information.\"}}, {\"type\": \"header\", \"data\": {\"text\": \"How We Use Your Information\", \"level\": 2}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"We use your information to process orders, send confirmations, respond to inquiries, and improve our services.\"}}, {\"type\": \"header\", \"data\": {\"text\": \"Cookies\", \"level\": 2}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"We use cookies to save preferences and analyze site traffic. You can control cookies through your browser settings.\"}}, {\"type\": \"header\", \"data\": {\"text\": \"Your Rights\", \"level\": 2}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"You may access, correct, or delete your personal information by contacting us.\"}}, {\"type\": \"header\", \"data\": {\"text\": \"Contact\", \"level\": 2}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"Questions about this policy? Visit our Contact page.\"}}]}"
    }
  }
}
GRAPHQL
echo ""

# Create Terms of Service
echo "Creating Terms of Service..."
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d @- << 'GRAPHQL'
{
  "query": "mutation CreatePage($input: PageCreateInput!) { pageCreate(input: $input) { page { id title slug } errors { field message } } }",
  "variables": {
    "input": {
      "title": "Terms of Service",
      "slug": "terms-of-service",
      "pageType": "UGFnZVR5cGU6MQ==",
      "isPublished": true,
      "content": "{\"blocks\": [{\"type\": \"header\", \"data\": {\"text\": \"Terms of Service\", \"level\": 1}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"Last updated: January 2026\"}}, {\"type\": \"header\", \"data\": {\"text\": \"Acceptance of Terms\", \"level\": 2}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"By using this website, you agree to these Terms of Service. If you disagree, please do not use our site.\"}}, {\"type\": \"header\", \"data\": {\"text\": \"Products and Pricing\", \"level\": 2}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"Prices are subject to change without notice. We reserve the right to modify or discontinue products at any time.\"}}, {\"type\": \"header\", \"data\": {\"text\": \"Orders and Payment\", \"level\": 2}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"We may refuse or cancel orders for any reason, including pricing errors. Payment is due at time of purchase.\"}}, {\"type\": \"header\", \"data\": {\"text\": \"Shipping\", \"level\": 2}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"Shipping times are estimates. We are not responsible for carrier delays. Risk passes to buyer upon shipment.\"}}, {\"type\": \"header\", \"data\": {\"text\": \"Returns\", \"level\": 2}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"See our Return Policy page for return and refund information.\"}}, {\"type\": \"header\", \"data\": {\"text\": \"Limitation of Liability\", \"level\": 2}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"We are not liable for indirect, incidental, or consequential damages from use of our website or products.\"}}, {\"type\": \"header\", \"data\": {\"text\": \"Changes\", \"level\": 2}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"We may update these terms at any time. Continued use constitutes acceptance.\"}}]}"
    }
  }
}
GRAPHQL
echo ""

# Create Return Policy
echo "Creating Return Policy..."
curl -s -X POST http://localhost:8000/graphql/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d @- << 'GRAPHQL'
{
  "query": "mutation CreatePage($input: PageCreateInput!) { pageCreate(input: $input) { page { id title slug } errors { field message } } }",
  "variables": {
    "input": {
      "title": "Return Policy",
      "slug": "return-policy",
      "pageType": "UGFnZVR5cGU6MQ==",
      "isPublished": true,
      "content": "{\"blocks\": [{\"type\": \"header\", \"data\": {\"text\": \"Return Policy\", \"level\": 1}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"Last updated: January 2026\"}}, {\"type\": \"header\", \"data\": {\"text\": \"Return Window\", \"level\": 2}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"Returns accepted within 30 days of delivery. Items must be unused and in original packaging.\"}}, {\"type\": \"header\", \"data\": {\"text\": \"Non-Returnable Items\", \"level\": 2}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"Opened trading card products, damaged items (unless shipping damage), custom orders, and final sale items cannot be returned.\"}}, {\"type\": \"header\", \"data\": {\"text\": \"How to Return\", \"level\": 2}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"Contact us with your order number and reason for return. We will provide return instructions.\"}}, {\"type\": \"header\", \"data\": {\"text\": \"Refunds\", \"level\": 2}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"Approved refunds processed to original payment method within 5-10 business days after inspection.\"}}, {\"type\": \"header\", \"data\": {\"text\": \"Shipping\", \"level\": 2}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"Return shipping is customer responsibility unless return is due to our error. Use trackable shipping.\"}}, {\"type\": \"header\", \"data\": {\"text\": \"Damaged Items\", \"level\": 2}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"Report damaged items within 48 hours with photos. We will replace or refund including shipping.\"}}, {\"type\": \"header\", \"data\": {\"text\": \"Questions\", \"level\": 2}}, {\"type\": \"paragraph\", \"data\": {\"text\": \"Contact us through our Contact page for return questions.\"}}]}"
    }
  }
}
GRAPHQL
echo ""

echo "Done!"
