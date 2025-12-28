
import { Box, Button, Container, Heading, HStack, useColorMode } from '@chakra-ui/react';
import { MoonIcon, SunIcon } from '@chakra-ui/icons';
import { Link as RouterLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProjectPage from './pages/ProjectPage';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuthStore } from './store/authStore';

function App() {
  const { colorMode, toggleColorMode } = useColorMode();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);

  return (
    <Box minH="100vh" display="flex" flexDirection="column" bg={colorMode === 'dark' ? 'gray.900' : 'gray.50'}>
      <Box as="header" p={4} boxShadow="md">
        <Container maxW="container.xl">
          <HStack justify="space-between">
            <Heading as="h1" size="lg">
              <Button as={RouterLink} to="/" variant="link" color={colorMode === 'dark' ? 'white' : 'gray.800'}>
                Music Collab
              </Button>
            </Heading>

            <HStack spacing={2}>
              {token ? (
                <>
                  <Button as={RouterLink} to="/dashboard" variant="ghost" color={colorMode === 'dark' ? 'white' : 'gray.800'}>
                    Dashboard
                  </Button>
                  <Button
                    variant="outline"
                    color={colorMode === 'dark' ? 'white' : 'gray.800'}
                    onClick={() => {
                      logout();
                      navigate('/');
                    }}
                  >
                    Logout
                  </Button>
                </>
              ) : (
                <>
                  <Button as={RouterLink} to="/login" variant="ghost" color={colorMode === 'dark' ? 'white' : 'gray.800'}>
                    Login
                  </Button>
                  <Button as={RouterLink} to="/register" variant="outline" color={colorMode === 'dark' ? 'white' : 'gray.800'}>
                    Register
                  </Button>
                </>
              )}

              <Button onClick={toggleColorMode} variant="ghost">
                {colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
              </Button>
            </HStack>
          </HStack>
        </Container>
      </Box>

      <Container maxW="container.xl" flex="1" py={8}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/project/:id"
            element={
              <ProtectedRoute>
                <ProjectPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Container>

      <Box as="footer" p={4} textAlign="center" color={colorMode === 'dark' ? 'gray.400' : 'gray.600'}>
        © {new Date().getFullYear()} Music Collab
      </Box>
    </Box>
  );
}

export default App;