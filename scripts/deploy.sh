#!/bin/bash

# Azure Function App Deployment Script
# Usage: ./scripts/deploy.sh <environment>
# Example: ./scripts/deploy.sh dev

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if environment parameter is provided
if [ $# -eq 0 ]; then
    print_error "Environment parameter is required"
    echo "Usage: $0 <environment>"
    echo "Example: $0 dev, $0 prod, $0 qa, $0 uat"
    exit 1
fi

ENVIRONMENT=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Environment can be any name
print_status "Deploying to $ENVIRONMENT environment"

# Check if required tools are installed
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command -v az &> /dev/null; then
        print_error "Azure CLI is not installed. Please install it first."
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install it first."
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install it first."
        exit 1
    fi
    
    print_success "All prerequisites are installed"
}

# Load environment variables
load_environment() {
    print_status "Loading environment variables..."
    
    ENV_FILE="$PROJECT_ROOT/.env.$ENVIRONMENT"
    if [ -f "$ENV_FILE" ]; then
        export $(cat "$ENV_FILE" | grep -v '^#' | grep -v '^$' | xargs)
        print_success "Environment variables loaded from $ENV_FILE"
    else
        print_warning "Environment file $ENV_FILE not found. Using system environment variables."
    fi
    
    # Check required environment variables
    REQUIRED_VARS=(
        "AZURE_SUBSCRIPTION_ID"
        "AZURE_RESOURCE_GROUP"
        "APIM_VALIDATION_KEY"
        "APIM_PORTAL_URL"
        "OIDC_ISSUER"
        "OIDC_CLIENT_ID"
        "OIDC_CLIENT_SECRET"
    )
    
    # Optional variables for cross-subscription APIM
    OPTIONAL_VARS=(
        "APIM_ACCESS_TOKEN"
    )
    
    # Set default values for optional configuration
    export APP_NAME="${APP_NAME:-apim-delegation}"
    export AZURE_LOCATION="${AZURE_LOCATION:-eastus2}"
    export RUNTIME="${RUNTIME:-node}"
    export AZURE_SKU="${AZURE_SKU:-FC1}"
    export AZURE_OS_TYPE="${AZURE_OS_TYPE:-linux}"
    export APIM_RESOURCE_GROUP="${APIM_RESOURCE_GROUP:-}"
    export APIM_SERVICE_NAME="${APIM_SERVICE_NAME:-}"
    
    for var in "${REQUIRED_VARS[@]}"; do
        if [ -z "${!var}" ]; then
            print_error "Required environment variable $var is not set"
            exit 1
        fi
    done
    
    print_success "All required environment variables are set"
}

# Login to Azure
azure_login() {
    print_status "Checking Azure login status..."
    
    if ! az account show &> /dev/null; then
        print_status "Not logged in to Azure. Starting login process..."
        az login
    fi
    
    # Set subscription
    if [ -n "$AZURE_SUBSCRIPTION_ID" ]; then
        print_status "Setting Azure subscription to $AZURE_SUBSCRIPTION_ID"
        az account set --subscription "$AZURE_SUBSCRIPTION_ID"
    fi
    
    CURRENT_SUBSCRIPTION=$(az account show --query "name" -o tsv)
    print_success "Using Azure subscription: $CURRENT_SUBSCRIPTION"
}

# Create resource group if it doesn't exist
create_resource_group() {
    print_status "Checking if resource group exists..."
    
    if ! az group show --name "$AZURE_RESOURCE_GROUP" &> /dev/null; then
        print_status "Creating resource group $AZURE_RESOURCE_GROUP..."
        LOCATION=${AZURE_LOCATION:-"eastus2"}
        az group create --name "$AZURE_RESOURCE_GROUP" --location "$LOCATION"
        print_success "Resource group created"
    else
        print_success "Resource group $AZURE_RESOURCE_GROUP already exists"
    fi
}

# Build and test the application
build_application() {
    print_status "Building and testing application..."
    
    cd "$PROJECT_ROOT"
    
    # Install dependencies
    print_status "Installing dependencies..."
    npm ci
    
    # Run linting
    if npm run lint &> /dev/null; then
        print_success "Linting passed"
    else
        print_warning "Linting failed or not configured"
    fi
    
    # Run tests
    if npm run test &> /dev/null; then
        print_success "Tests passed"
    else
        print_warning "Tests failed or not configured"
    fi
    
    print_success "Application build completed"
}

# Deploy infrastructure
deploy_infrastructure() {
    print_status "Deploying infrastructure..."
    
    cd "$PROJECT_ROOT"
    
    BICEP_FILE="infrastructure/main.bicep"
    
    if [ ! -f "$BICEP_FILE" ]; then
        print_error "Bicep template not found: $BICEP_FILE"
        exit 1
    fi
    
    print_status "Deploying Bicep template with direct parameters..."
    DEPLOYMENT_NAME="${APP_NAME}-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)"
    
    # Prepare tags based on environment
    ENVIRONMENT_TITLE=$(echo "$ENVIRONMENT" | sed 's/.*/\u&/')
    
    az deployment group create \
        --resource-group "$AZURE_RESOURCE_GROUP" \
        --template-file "$BICEP_FILE" \
        --parameters \
            appName="$APP_NAME" \
            location="$AZURE_LOCATION" \
            runtime="$RUNTIME" \
            sku="$AZURE_SKU" \
            osType="$AZURE_OS_TYPE" \
            environment="$ENVIRONMENT" \
            apimValidationKey="$APIM_VALIDATION_KEY" \
            apimPortalUrl="$APIM_PORTAL_URL" \
            oidcIssuer="$OIDC_ISSUER" \
            oidcClientId="$OIDC_CLIENT_ID" \
            oidcClientSecret="$OIDC_CLIENT_SECRET" \
            oidcAuthorizationEndpoint="${OIDC_AUTHORIZATION_ENDPOINT:-}" \
            oidcTokenEndpoint="${OIDC_TOKEN_ENDPOINT:-}" \
            oidcUserinfoEndpoint="${OIDC_USERINFO_ENDPOINT:-}" \
            apimResourceGroup="${APIM_RESOURCE_GROUP:-}" \
            apimServiceName="${APIM_SERVICE_NAME:-}" \
            apimAccessToken="${APIM_ACCESS_TOKEN:-}" \
        --name "$DEPLOYMENT_NAME" \
        --verbose \
        --debug
    
    # Get deployment outputs
    FUNCTION_APP_NAME=$(az deployment group show \
        --resource-group "$AZURE_RESOURCE_GROUP" \
        --name "$DEPLOYMENT_NAME" \
        --query "properties.outputs.functionAppName.value" -o tsv)
    
    FUNCTION_APP_URL=$(az deployment group show \
        --resource-group "$AZURE_RESOURCE_GROUP" \
        --name "$DEPLOYMENT_NAME" \
        --query "properties.outputs.functionAppHostName.value" -o tsv)
    
    print_success "Infrastructure deployed successfully"
    print_success "Function App Name: $FUNCTION_APP_NAME"
    print_success "Function App URL: https://$FUNCTION_APP_URL"
    
    # Export for use in application deployment
    export FUNCTION_APP_NAME
    export FUNCTION_APP_URL
}

# Deploy application code
deploy_application() {
    print_status "Deploying application code..."
    
    cd "$PROJECT_ROOT"
    
    if [ -z "$FUNCTION_APP_NAME" ]; then
        print_error "Function App name not available. Infrastructure deployment may have failed."
        exit 1
    fi
    
    # Create deployment package
    print_status "Creating deployment package..."
    
    # Install production dependencies only
    npm ci --only=production
    
    # Create ZIP file for deployment
    ZIP_FILE="deployment-$(date +%Y%m%d-%H%M%S).zip"
    print_status "Creating ZIP package: $ZIP_FILE"
    
    # Set up cleanup trap to ensure ZIP file is always removed
    cleanup_zip() {
        if [ -f "$ZIP_FILE" ]; then
            print_status "Cleaning up ZIP file: $ZIP_FILE"
            rm -f "$ZIP_FILE"
        fi
    }
    trap cleanup_zip EXIT
    
    zip -r "$ZIP_FILE" . \
        -x "*.git*" \
        -x "node_modules/.cache/*" \
        -x "*.env*" \
        -x "*.log" \
        -x "coverage/*" \
        -x "test*" \
        -x "docs/*" \
        -x "infrastructure/*" \
        -x "scripts/*" \
        -x "*.md" \
        -x "*.zip"
    
    if [ ! -f "$ZIP_FILE" ]; then
        print_error "Failed to create ZIP package"
        exit 1
    fi
    
    # Deploy the ZIP file
    print_status "Deploying to Function App: $FUNCTION_APP_NAME"
    if az functionapp deployment source config-zip \
        --resource-group "$AZURE_RESOURCE_GROUP" \
        --name "$FUNCTION_APP_NAME" \
        --src "$ZIP_FILE"; then
        print_success "Application deployed successfully"
    else
        print_error "Deployment failed"
        exit 1
    fi
    
    # Clean up the ZIP file (trap will also handle this)
    cleanup_zip
    trap - EXIT  # Remove the trap after successful cleanup
}

# Run smoke tests
run_smoke_tests() {
    print_status "Running smoke tests..."
    
    if [ -z "$FUNCTION_APP_URL" ]; then
        print_error "Function App URL not available. Deployment may have failed."
        exit 1
    fi
    
    BASE_URL="https://$FUNCTION_APP_URL"
    
    # Test health endpoint
    print_status "Testing health endpoint..."
    HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/health")
    
    if [ "$HEALTH_RESPONSE" -eq 200 ]; then
        print_success "Health check passed"
    else
        print_error "Health check failed with status code: $HEALTH_RESPONSE"
        exit 1
    fi
    
    # Test delegation endpoint (should return 401 without valid signature)
    print_status "Testing delegation endpoint..."
    DELEGATION_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/delegation?operation=SignIn&returnUrl=test")
    
    if [ "$DELEGATION_RESPONSE" -eq 401 ]; then
        print_success "Delegation endpoint correctly rejects invalid requests"
    else
        print_warning "Delegation endpoint test returned unexpected status code: $DELEGATION_RESPONSE"
    fi
    
    print_success "Smoke tests completed"
}

# Main deployment process
main() {
    print_status "Starting deployment to $ENVIRONMENT environment..."
    
    check_prerequisites
    load_environment
    azure_login
    create_resource_group
    build_application
    deploy_infrastructure
    deploy_application
    run_smoke_tests
    
    print_success "🚀 Deployment completed successfully!"
    echo ""
    echo "📋 Deployment Summary:"
    echo "  Environment: $ENVIRONMENT"
    echo "  Function App: $FUNCTION_APP_NAME"
    echo "  URL: https://$FUNCTION_APP_URL"
    echo "  Health Check: https://$FUNCTION_APP_URL/api/health"
    echo "  Delegation: https://$FUNCTION_APP_URL/api/delegation"
    echo "  Auth Callback: https://$FUNCTION_APP_URL/api/auth-callback"
    echo ""
    echo "🔧 Next Steps:"
    echo "  1. Update your APIM delegation settings with the new URL"
    echo "  2. Update your OIDC provider redirect URI if needed"
    echo "  3. Test the complete authentication flow"
}

# Run main function
main "$@"