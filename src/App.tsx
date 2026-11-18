import { AuthProvider, useAuth } from "@/lib/auth";
import { SchoolSettingsProvider } from "@/lib/schoolSettings";
import { ThemeProvider } from "@/lib/themeMode";
import { useHashRoute, navigate } from "@/lib/router";
import { FullPageLoader } from "@/components/ui";
import { AppLayout } from "@/components/AppLayout";
import { SetupGate } from "@/components/SetupGate";
import { AuthPage } from "@/pages/AuthPage";
import { TeacherGradeRecap } from "@/pages/teacher-rapor";
import { AdminBranding } from "@/pages/admin-branding";
import { AdminExamApprovals } from "@/pages/admin-exam-approvals";
import {
  AdminDashboard, AdminUsers, AdminAcademics, AdminAssignments,
  AdminGrades, AdminAudit, AdminQuestionBank, AdminPeriods,
} from "@/pages/admin";
import { AdminExams } from "@/pages/admin-exams";
import { ExamMonitoring } from "@/pages/exam-monitoring";
import { TeacherExams, TeacherGrading } from "@/pages/teacher";
import { TeacherDashboard } from "@/pages/teacher-dashboard";
import { TeacherQuestions } from "@/pages/teacher-questions";
import {
  StudentDashboard, StudentResults, StudentResultDetail, StudentExam,
} from "@/pages/student";
import { useEffect } from "react";

function Router() {
  const { profile, loading, isHomeroom } = useAuth();
  const [path] = useHashRoute();

  // Redirect logic
  useEffect(() => {
    if (loading) return;
    if (!profile && !path.startsWith("/login") && path !== "/admin" && path !== "/guru") {
      navigate("/login");
    }
    if (profile && (path === "/login" || path === "/admin" || path === "/guru")) {
      if (profile.role === "super_admin") navigate("/admin");
      else if (profile.role === "teacher") navigate("/guru");
      else navigate("/siswa");
    }
  }, [profile, loading, path]);

  if (loading) return <FullPageLoader />;

  // Public routes — role-specific login portals
  if (!profile) {
    if (path === "/admin") return <AuthPage role="super_admin" />;
    if (path === "/guru") return <AuthPage role="teacher" />;
    return <AuthPage />;
  }

  // Student exam route — no layout (fullscreen CBT)
  if (path.startsWith("/siswa/ujian/")) {
    const examId = path.split("/")[3];
    if (profile.role === "student") return <StudentExam examId={examId} />;
  }

  // Student result detail
  if (path.startsWith("/siswa/hasil/")) {
    const attemptId = path.split("/")[3];
    if (profile.role === "student") {
      return (
        <AppLayout>
          <StudentResultDetail attemptId={attemptId} />
        </AppLayout>
      );
    }
  }

  // Role-based routing
  const renderPage = () => {
    switch (profile.role) {
      case "super_admin":
        if (path === "/admin" || path === "/") return <AdminDashboard />;
        if (path === "/admin/users") return <AdminUsers />;
        if (path === "/admin/users/create") return <AdminUsers initialModal="create" />;
        if (path === "/admin/users/import") return <AdminUsers initialModal="import" />;
        if (path === "/admin/branding") return <AdminBranding />;
        if (path === "/admin/academics") return <AdminAcademics />;
        if (path === "/admin/assignments") return <AdminAssignments />;
        if (path === "/admin/periods") return <AdminPeriods />;
        if (path === "/admin/grades") return <AdminGrades />;
        if (path === "/admin/ujian") return <AdminExams />;
        if (path === "/admin/pemantauan") return <ExamMonitoring />;
        if (path === "/admin/bank-soal") return <AdminQuestionBank />;
        if (path === "/admin/persetujuan") return <AdminExamApprovals />;
        if (path === "/admin/audit") return <AdminAudit />;
        return <AdminDashboard />;

      case "teacher":
        if (path === "/guru" || path === "/") return <TeacherDashboard />;
        if (path === "/guru/soal") return <TeacherQuestions />;
        if (path === "/guru/ujian") return <TeacherExams />;
        if (path === "/guru/pemantauan") return <ExamMonitoring />;
        if (path === "/guru/koreksi") return <TeacherGrading />;
        if (path === "/guru/rapor") {
          if (!isHomeroom) return <TeacherDashboard />;
          return <TeacherGradeRecap />;
        }
        return <TeacherDashboard />;

      case "student":
        if (path === "/siswa" || path === "/") return <StudentDashboard />;
        if (path === "/siswa/nilai") return <StudentResults />;
        return <StudentDashboard />;

      default:
        return <FullPageLoader />;
    }
  };

  return <AppLayout>{renderPage()}</AppLayout>;
}

export default function App() {
  return (
    <AuthProvider>
      <SchoolSettingsProvider>
        <ThemeProvider>
          <SetupGate>
            <Router />
          </SetupGate>
        </ThemeProvider>
      </SchoolSettingsProvider>
    </AuthProvider>
  );
}
