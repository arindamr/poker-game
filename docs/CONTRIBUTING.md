# Contributing Guidelines

Guidelines for contributing to the poker app project.

## Code Style

### Backend (Node.js)
- Use ESLint configuration (airbnb-base)
- Format with Prettier
- Async/await over callbacks
- Clear error handling

### Frontend (Flutter)
- Follow Dart naming conventions
- Use const constructors
- Proper state management with Provider
- Null safety enabled

## Commit Messages

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: feat, fix, docs, style, refactor, test, chore

Example:
```
feat(auth): add 2FA support for user login

- Implement TOTP-based 2FA
- Add backup codes generation
- Update user model

Closes #123
```

## Pull Request Process

1. Fork and create feature branch
2. Write tests for new functionality
3. Update documentation
4. Submit PR with description
5. Address review feedback

## Running Tests

```bash
# Backend
npm test
npm run test:integration

# Frontend
flutter test
```

---

*Detailed guidelines pending project kickoff*
