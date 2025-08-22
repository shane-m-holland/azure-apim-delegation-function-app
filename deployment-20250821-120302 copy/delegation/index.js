// wwwroot/delegation/index.js
const crypto = require('crypto');
const { getOidcConfiguration, buildAuthorizationUrl } = require('../shared/oidc-helper');

// Validate APIM signature using the CORRECT Microsoft specification
function validateApimSignature(operation, salt, returnUrl, userId, signature, context) {
    if (!process.env.APIM_VALIDATION_KEY || !signature) {
        return false;
    }
    
    let stringToSign;
    
    // Use the EXACT Microsoft specification for string construction
    switch (operation) {
        case 'SignIn':
        case 'SignUp':
            stringToSign = salt + '\n' + returnUrl;
            break;
        case 'ChangePassword':
        case 'ChangeProfile':
        case 'CloseAccount':
        case 'SignOut':
            stringToSign = salt + '\n' + userId;
            break;
        default:
            context.log('Unsupported operation for signature validation:', operation);
            return false;
    }
    
    context.log('String to sign:', JSON.stringify(stringToSign));
    
    // Use HMAC-SHA512 with base64-decoded key (Microsoft's exact specification)
    const keyBytes = Buffer.from(process.env.APIM_VALIDATION_KEY, 'base64');
    const hmac = crypto.createHmac('sha512', keyBytes);
    const computedSignature = hmac.update(stringToSign, 'utf8').digest('base64');
    
    context.log('Computed signature:', computedSignature);
    context.log('Received signature:', signature);
    context.log('Signatures match:', computedSignature === signature);
    
    return computedSignature === signature;
}

module.exports = async function (context, req) {
    context.log('Delegation endpoint called');

    try {
        // Get query parameters
        const operation = req.query.operation;
        const userId = req.query.userId;
        const salt = req.query.salt;
        const returnUrl = req.query.returnUrl;
        const signature = req.query.sig;

        context.log('Operation:', operation);
        context.log('UserId:', userId);
        context.log('ReturnUrl:', returnUrl);
        context.log('Salt:', salt);

        // Validate APIM signature using Microsoft's exact specification
        if (!validateApimSignature(operation, salt, returnUrl, userId, signature, context)) {
            context.log.error('Signature validation failed');
            context.res = {
                status: 401,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: { error: 'Invalid signature' }
            };
            return;
        }

        context.log('Signature validated successfully');

        if (operation === 'SignIn') {
            context.log('Processing SignIn operation');

            // Get OIDC configuration with endpoint discovery
            let oidcConfig;
            try {
                oidcConfig = await getOidcConfiguration(context);
                context.log('OIDC configuration loaded successfully');
            } catch (error) {
                context.log.error('Failed to load OIDC configuration:', error.message);
                context.res = {
                    status: 500,
                    body: { error: 'Server configuration error' }
                };
                return;
            }

            // Create state data for the OAuth flow
            const stateData = {
                returnUrl,
                salt,
                userId,
                timestamp: Date.now()
            };
            
            // Encode state data
            const encodedState = Buffer.from(JSON.stringify(stateData)).toString('base64');
            
            // Build authorization URL using discovered endpoints
            const authUrl = buildAuthorizationUrl(oidcConfig, encodedState);
            
            context.log('Redirecting to OIDC provider:', authUrl);

            context.res = {
                status: 302,
                headers: {
                    'Location': authUrl
                }
            };
            return;
        }

        context.log('Unsupported operation:', operation);
        context.res = {
            status: 400,
            headers: {
                'Content-Type': 'application/json'
            },
            body: { error: 'Unsupported operation' }
        };

    } catch (error) {
        context.log.error('Delegation function error:', error);
        context.res = {
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: { error: 'Internal server error', details: error.message }
        };
    }
};