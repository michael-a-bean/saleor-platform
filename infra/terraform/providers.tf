# AWS Provider Configuration

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "saleor-platform"
      Environment = var.environment
      ManagedBy   = "terraform"
      Repository  = "saleor-platform"
    }
  }
}

# Secondary provider for us-east-1 (required for ACM certs for CloudFront)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "saleor-platform"
      Environment = var.environment
      ManagedBy   = "terraform"
      Repository  = "saleor-platform"
    }
  }
}
