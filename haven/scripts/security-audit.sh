#!/bin/bash

echo "🔒 Running Security Audit..."
echo "================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ISSUES=0

# 1. NPM Audit
echo -e "\n${YELLOW}1. Running npm audit...${NC}"
npm audit --json > audit-results.json 2>/dev/null
if [ -f audit-results.json ]; then
    VULNS=$(cat audit-results.json | jq '.metadata.vulnerabilities.high + .metadata.vulnerabilities.critical' 2>/dev/null || echo "0")
    if [ "$VULNS" -gt 0 ]; then
        echo -e "${RED}❌ Found $VULNS high/critical vulnerabilities${NC}"
        ISSUES=$((ISSUES + 1))
    else
        echo -e "${GREEN}✅ No high/critical vulnerabilities${NC}"
    fi
    rm -f audit-results.json
else
    echo -e "${YELLOW}⚠️  Could not run npm audit${NC}"
fi

# 2. Check for secrets in code
echo -e "\n${YELLOW}2. Scanning for secrets...${NC}"
if grep -rn --include="*.ts" --include="*.tsx" --include="*.js" \
    -E "(password|secret|api_key|apikey|token)\s*[:=]\s*['\"][^'\"]+['\"]" src/ 2>/dev/null | \
    grep -v "process.env" | grep -v "example" | grep -v ".test." > /dev/null; then
    echo -e "${RED}❌ Potential hardcoded secrets found${NC}"
    ISSUES=$((ISSUES + 1))
else
    echo -e "${GREEN}✅ No hardcoded secrets detected${NC}"
fi

# 3. Check .env files not in gitignore
echo -e "\n${YELLOW}3. Checking .env file security...${NC}"
if [ -f ".env" ] && ! grep -q "^\.env$" .gitignore 2>/dev/null; then
    echo -e "${RED}❌ .env file not in .gitignore${NC}"
    ISSUES=$((ISSUES + 1))
else
    echo -e "${GREEN}✅ .env files properly gitignored${NC}"
fi

# 4. Check for console.log in production code
echo -e "\n${YELLOW}4. Checking for console.log statements...${NC}"
CONSOLE_COUNT=$(grep -rn --include="*.ts" --include="*.tsx" "console.log" src/ 2>/dev/null | \
    grep -v ".test." | grep -v "// DEBUG" | wc -l)
if [ "$CONSOLE_COUNT" -gt 10 ]; then
    echo -e "${YELLOW}⚠️  Found $CONSOLE_COUNT console.log statements (review needed)${NC}"
else
    echo -e "${GREEN}✅ Minimal console.log usage${NC}"
fi

# 5. Check for eval usage
echo -e "\n${YELLOW}5. Checking for dangerous functions...${NC}"
if grep -rn --include="*.ts" --include="*.tsx" -E "\beval\s*\(|\bFunction\s*\(" src/ 2>/dev/null | \
    grep -v ".test." > /dev/null; then
    echo -e "${RED}❌ Dangerous eval/Function usage found${NC}"
    ISSUES=$((ISSUES + 1))
else
    echo -e "${GREEN}✅ No dangerous function usage${NC}"
fi

# 6. Check security headers in middleware
echo -e "\n${YELLOW}6. Checking security headers configuration...${NC}"
if grep -q "Strict-Transport-Security" src/lib/security/middleware.ts 2>/dev/null && \
   grep -q "Content-Security-Policy" src/lib/security/middleware.ts 2>/dev/null; then
    echo -e "${GREEN}✅ Security headers configured${NC}"
else
    echo -e "${RED}❌ Security headers missing${NC}"
    ISSUES=$((ISSUES + 1))
fi

# 7. Check rate limiting
echo -e "\n${YELLOW}7. Checking rate limiting...${NC}"
if grep -rn "rateLimit\|Ratelimit" src/ 2>/dev/null | grep -v ".test." > /dev/null; then
    echo -e "${GREEN}✅ Rate limiting implemented${NC}"
else
    echo -e "${RED}❌ Rate limiting not found${NC}"
    ISSUES=$((ISSUES + 1))
fi

# 8. Check for SQL injection patterns
echo -e "\n${YELLOW}8. Checking for SQL injection vulnerabilities...${NC}"
if grep -rn --include="*.ts" -E '\$\{.*\}.*SELECT|SELECT.*\+.*\"|query\s*\(' src/ 2>/dev/null | \
    grep -v "supabase" | grep -v ".test." > /dev/null; then
    echo -e "${RED}❌ Potential SQL injection patterns found${NC}"
    ISSUES=$((ISSUES + 1))
else
    echo -e "${GREEN}✅ No obvious SQL injection patterns${NC}"
fi

# Summary
echo -e "\n================================"
if [ "$ISSUES" -gt 0 ]; then
    echo -e "${RED}Security Audit Complete: $ISSUES issues found${NC}"
    exit 1
else
    echo -e "${GREEN}Security Audit Complete: All checks passed!${NC}"
    exit 0
fi
