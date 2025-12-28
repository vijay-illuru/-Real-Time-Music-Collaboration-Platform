import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Text,
  useColorMode,
} from '@chakra-ui/react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function LoginPage() {
  const { colorMode } = useColorMode();
  const navigate = useNavigate();
  const location = useLocation();

  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const from = location.state?.from || '/dashboard';

  const onSubmit = async (e) => {
    e.preventDefault();
    const ok = await login({ email, password });
    if (ok) navigate(from);
  };

  return (
    <Box
      bg={colorMode === 'dark' ? 'gray.800' : 'white'}
      p={8}
      borderRadius="lg"
      boxShadow="lg"
      maxW="480px"
      mx="auto"
    >
      <Heading size="lg" mb={6}>
        Login
      </Heading>

      <form onSubmit={onSubmit}>
        <FormControl mb={4} isRequired>
          <FormLabel>Email</FormLabel>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
        </FormControl>

        <FormControl mb={6} isRequired>
          <FormLabel>Password</FormLabel>
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
          />
        </FormControl>

        {error ? (
          <Text color="red.300" mb={4}>
            {error}
          </Text>
        ) : null}

        <Button type="submit" colorScheme="brand" isLoading={loading} width="100%">
          Login
        </Button>

        <Text mt={4} color={colorMode === 'dark' ? 'gray.300' : 'gray.600'}>
          No account? <Link to="/register">Register</Link>
        </Text>
      </form>
    </Box>
  );
}
