import {
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Spinner,
  Stack,
  Text,
  useColorMode,
} from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { useAuthStore } from '../store/authStore';

export default function DashboardPage() {
  const { colorMode } = useColorMode();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const logout = useAuthStore((s) => s.logout);

  const [health, setHealth] = useState({ status: 'loading', error: '' });
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState('');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  const headerText = useMemo(() => {
    if (!user) return 'Dashboard';
    return `Dashboard - ${user.username}`;
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const runHealth = async () => {
      try {
        const json = await apiRequest('/api/health');
        if (!cancelled) setHealth({ status: json.status || 'ok', error: '' });
      } catch (e) {
        if (!cancelled) setHealth({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    };

    runHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const loadProjects = async () => {
    setProjectsLoading(true);
    setProjectsError('');
    try {
      const list = await apiRequest('/api/projects', { token });
      setProjects(Array.isArray(list) ? list : []);
    } catch (e) {
      setProjectsError(e instanceof Error ? e.message : String(e));
    } finally {
      setProjectsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
    
  }, [token]);

  const onCreate = async (e) => {
    e.preventDefault();
    setCreateError('');

    const trimmed = name.trim();
    if (!trimmed) {
      setCreateError('Project name is required');
      return;
    }

    setCreateLoading(true);
    try {
      await apiRequest('/api/projects', {
        method: 'POST',
        token,
        body: { name: trimmed, description: description.trim() },
      });

      setName('');
      setDescription('');
      await loadProjects();
    } catch (e2) {
      setCreateError(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <Stack spacing={6}>
      <Box
        bg={colorMode === 'dark' ? 'gray.800' : 'white'}
        p={8}
        borderRadius="lg"
        boxShadow="lg"
      >
        <HStack justify="space-between" align="start" mb={4}>
          <Box>
            <Heading size="lg">{headerText}</Heading>
            <Text color={colorMode === 'dark' ? 'gray.300' : 'gray.600'} mt={1}>
              {user ? user.email : 'Loading user...'}
            </Text>
          </Box>

          <Button variant="outline" onClick={logout}>
            Logout
          </Button>
        </HStack>

        <HStack spacing={3} mb={2}>
          <Text fontWeight="semibold">Backend:</Text>
          {health.status === 'loading' ? (
            <Spinner size="sm" />
          ) : health.status === 'error' ? (
            <Text color="red.300">{health.error}</Text>
          ) : (
            <Text color="green.300">{health.status}</Text>
          )}
        </HStack>

        <Divider my={6} />

        <Heading size="md" mb={4}>
          Create project
        </Heading>

        <Box as="form" onSubmit={onCreate}>
          <FormControl mb={4} isRequired>
            <FormLabel>Name</FormLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My new project" />
          </FormControl>
          <FormControl mb={4}>
            <FormLabel>Description</FormLabel>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </FormControl>

          {createError ? (
            <Text color="red.300" mb={4}>
              {createError}
            </Text>
          ) : null}

          <Button type="submit" colorScheme="brand" isLoading={createLoading}>
            Create
          </Button>
        </Box>
      </Box>

      <Box
        bg={colorMode === 'dark' ? 'gray.800' : 'white'}
        p={8}
        borderRadius="lg"
        boxShadow="lg"
      >
        <HStack justify="space-between" mb={4}>
          <Heading size="md">Your projects</Heading>
          <Button variant="ghost" onClick={loadProjects} isLoading={projectsLoading}>
            Refresh
          </Button>
        </HStack>

        {projectsError ? <Text color="red.300">{projectsError}</Text> : null}

        {projectsLoading ? (
          <Spinner />
        ) : projects.length === 0 ? (
          <Text color={colorMode === 'dark' ? 'gray.300' : 'gray.600'}>No projects yet.</Text>
        ) : (
          <Stack spacing={3}>
            {projects.map((p) => (
              <Box
                key={p._id}
                borderWidth="1px"
                borderColor={colorMode === 'dark' ? 'gray.700' : 'gray.200'}
                borderRadius="md"
                p={4}
                cursor="pointer"
                onClick={() => navigate(`/project/${p._id}`)}
                _hover={{ opacity: 0.9 }}
              >
                <Text fontWeight="semibold">{p.name}</Text>
                {p.description ? (
                  <Text color={colorMode === 'dark' ? 'gray.300' : 'gray.600'}>{p.description}</Text>
                ) : null}
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
