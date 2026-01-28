# Orphaned VPC Cleanup

**Generated:** 2026-01-27
**Context:** VPC alignment completed - old Terraform VPC no longer needed

## Orphaned VPC Inventory

| VPC ID | Name | Status |
|--------|------|--------|
| `vpc-03bec79de659bddf7` | Original VPC | **Already deleted** |
| `vpc-088fb7c0a22060c10` | Old Terraform VPC | **Active - cleanup required** |

## Resources to Delete (in order)

VPC deletion requires removing dependencies in a specific order.

### Step 1: Delete VPC Endpoints (6 endpoints)

```bash
# Delete VPC endpoints first (they block ENI deletion)
aws ec2 delete-vpc-endpoints --vpc-endpoint-ids \
  vpce-0a40890e55a54cf02 \
  vpce-0377a21afcbc3d03b \
  vpce-0e37416ef65997993 \
  vpce-00bd7b980593c6a7c \
  vpce-0dd07a4cea199b99d \
  vpce-0147be8a4fb314646
```

### Step 2: Delete NAT Gateway (1 gateway)

```bash
# Delete NAT gateway (will release EIP automatically if allocated)
aws ec2 delete-nat-gateway --nat-gateway-id nat-066af8ccd5fe4c7d0

# Wait for NAT gateway to delete (takes ~1-2 minutes)
aws ec2 wait nat-gateway-deleted --nat-gateway-ids nat-066af8ccd5fe4c7d0 2>/dev/null || \
  echo "Waiting for NAT gateway deletion..."
sleep 60
```

### Step 3: Delete Security Groups (8 non-default)

```bash
# Delete security groups (cannot delete 'default')
for sg in sg-0e32141ea6436fbe1 sg-0d456409ba84f0aeb sg-0d83f040cc8613fc4 \
          sg-085736af05c04bcaa sg-0138190af495ccf39 sg-041ea6ef6c8e940f4 \
          sg-01fd386f7b4eae528 sg-06e381944d716c005; do
  aws ec2 delete-security-group --group-id $sg && echo "Deleted $sg" || echo "Failed: $sg"
done
```

### Step 4: Delete Subnets (4 subnets)

```bash
# Delete subnets
for subnet in subnet-01358b3ea5ce72bc1 subnet-0b11279ac7bf4cd1c \
              subnet-028790186304c64cc subnet-0006e484ccb0ad473; do
  aws ec2 delete-subnet --subnet-id $subnet && echo "Deleted $subnet" || echo "Failed: $subnet"
done
```

### Step 5: Detach and Delete Internet Gateway

```bash
# Detach IGW from VPC
aws ec2 detach-internet-gateway \
  --internet-gateway-id igw-05ed067171b33f107 \
  --vpc-id vpc-088fb7c0a22060c10

# Delete IGW
aws ec2 delete-internet-gateway --internet-gateway-id igw-05ed067171b33f107
```

### Step 6: Delete Route Tables (non-main only)

```bash
# Find and delete custom route tables
aws ec2 describe-route-tables \
  --filters "Name=vpc-id,Values=vpc-088fb7c0a22060c10" \
  --query 'RouteTables[?Associations[0].Main!=`true`].RouteTableId' \
  --output text | xargs -n1 aws ec2 delete-route-table --route-table-id
```

### Step 7: Delete VPC

```bash
# Finally delete the VPC
aws ec2 delete-vpc --vpc-id vpc-088fb7c0a22060c10
```

## One-Liner Cleanup Script

```bash
# Full cleanup (run each section and verify before proceeding)

# 1. VPC Endpoints
aws ec2 delete-vpc-endpoints --vpc-endpoint-ids vpce-0a40890e55a54cf02 vpce-0377a21afcbc3d03b vpce-0e37416ef65997993 vpce-00bd7b980593c6a7c vpce-0dd07a4cea199b99d vpce-0147be8a4fb314646

# 2. NAT Gateway (then wait ~60s)
aws ec2 delete-nat-gateway --nat-gateway-id nat-066af8ccd5fe4c7d0 && sleep 90

# 3. Security Groups
for sg in sg-0e32141ea6436fbe1 sg-0d456409ba84f0aeb sg-0d83f040cc8613fc4 sg-085736af05c04bcaa sg-0138190af495ccf39 sg-041ea6ef6c8e940f4 sg-01fd386f7b4eae528 sg-06e381944d716c005; do aws ec2 delete-security-group --group-id $sg 2>/dev/null; done

# 4. Subnets
for subnet in subnet-01358b3ea5ce72bc1 subnet-0b11279ac7bf4cd1c subnet-028790186304c64cc subnet-0006e484ccb0ad473; do aws ec2 delete-subnet --subnet-id $subnet 2>/dev/null; done

# 5. Internet Gateway
aws ec2 detach-internet-gateway --internet-gateway-id igw-05ed067171b33f107 --vpc-id vpc-088fb7c0a22060c10 && aws ec2 delete-internet-gateway --internet-gateway-id igw-05ed067171b33f107

# 6. Route Tables
aws ec2 describe-route-tables --filters "Name=vpc-id,Values=vpc-088fb7c0a22060c10" --query 'RouteTables[?Associations[0].Main!=`true`].RouteTableId' --output text | xargs -n1 aws ec2 delete-route-table --route-table-id 2>/dev/null

# 7. VPC
aws ec2 delete-vpc --vpc-id vpc-088fb7c0a22060c10
```

## Cost Implications

| Resource | Monthly Cost | Notes |
|----------|-------------|-------|
| NAT Gateway | ~$32/month | Plus data processing |
| VPC Endpoints (6x Interface) | ~$7.30/month each = $43.80 | Plus data processing |
| Elastic IP (if allocated) | ~$3.65/month | If not attached |
| **Total Waste** | **~$75-80/month** | |

## Verification

After cleanup, verify VPC is gone:

```bash
aws ec2 describe-vpcs --vpc-ids vpc-088fb7c0a22060c10 2>&1
# Should return: "The vpc ID 'vpc-088fb7c0a22060c10' does not exist"
```

## Safety Notes

1. **Verify no active resources** - All ECS, RDS, ElastiCache should be in production VPC
2. **Production VPC** - `vpc-0b0360f5c0c874c59` - DO NOT DELETE
3. **Order matters** - Dependencies must be deleted before parent resources
4. **NAT Gateway deletion is slow** - Takes 1-2 minutes, be patient
