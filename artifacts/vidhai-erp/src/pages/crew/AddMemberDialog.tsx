import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const apiBase = String(
  import.meta.env.VITE_API_BASE || import.meta.env.BASE_URL || "",
)
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");
const today = () => new Date().toLocaleDateString("en-CA");
const initial = () => ({
  userId: "",
  employeeCode: "",
  name: "",
  dateOfBirth: "",
  gender: "",
  email: "",
  phone: "",
  alternatePhone: "",
  maritalStatus: "",
  bloodGroup: "",
  fatherName: "",
  motherName: "",
  emergencyContactRelation: "",
  emergencyContactPhone: "",
  role: "",
  designation: "",
  department: "",
  employmentType: "Full-time",
  status: "Active",
  workMode: "On-site",
  reportingManager: "",
  location: "",
  joinDate: today(),
  exitDate: "",
  attendanceRulesTemplate: "",
  workPatternTemplate: "",
  holidayTemplate: "",
  leaveTemplate: "",
  salaryTemplateId: "",
  annualCtc: "",
  baseSalary: "",
  fixedComponentValues: {} as Record<string, string>,
  aadhaarNumber: "",
  panNumber: "",
  uan: "",
  pfNumber: "",
  pfJoiningDate: "",
  esiNumber: "",
  bankName: "",
  accountHolderName: "",
  accountNumber: "",
  ifscCode: "",
  skills: "",
  certifications: "",
  photoUrl: "",
  employeePhotoFile: null as File | null,
  removePhoto: false,
  includeInUser: false,
  userAccountEmail: "",
  userAccountUsername: "",
});
type Form = ReturnType<typeof initial>;
type Errors = Partial<Record<keyof Form, string>>;
type MemberFormContextValue = {
  f: Form;
  errors: Errors;
  refs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  field: (key: keyof Form, value: any) => void;
};
const MemberFormContext = createContext<MemberFormContextValue | null>(null);
const useMemberForm = () => {
  const value = useContext(MemberFormContext);
  if (!value)
    throw new Error("Member form fields must be inside AddMemberDialog");
  return value;
};
const digits = (v: string) => v.replace(/\D/g, "");
const tags = (v: string) => [
  ...new Set(
    v
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  ),
];
const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
async function request(path: string, options?: RequestInit) {
  const r = await fetch(`${apiBase}/api/${path}`, {
    credentials: "include",
    ...options,
  });
  if (!r.ok) {
    let m = `HTTP ${r.status}`;
    try {
      m = (await r.json()).error || m;
    } catch {}
    throw new Error(m);
  }
  return r.status === 204 ? null : r.json();
}

export function AddMemberDialog({
  open,
  onOpenChange,
  employees,
  editingEmployee,
  initialEmployee,
  beforeCreate,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employees: any[];
  editingEmployee?: any | null;
  initialEmployee?: any | null;
  beforeCreate?: () => Promise<any>;
  onCreated: () => Promise<void>;
}) {
  const { can } = useAuth(),
    { toast } = useToast();
  const [f, setF] = useState<Form>(initial),
    [errors, setErrors] = useState<Errors>({}),
    [saving, setSaving] = useState(false),
    [options, setOptions] = useState<any>({
      users: [],
      attendance: [],
      workPatterns: [],
      holidays: [],
      leave: [],
      salary: [],
    }),
    [preview, setPreview] = useState(""),
    [userDialog, setUserDialog] = useState(false),
    [newUser, setNewUser] = useState({
      name: "",
      email: "",
      username: "",
      role: "viewer",
    });
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const field = (key: keyof Form, value: any) => {
    setF((x) => ({ ...x, [key]: value }));
    setErrors((x) => ({ ...x, [key]: undefined }));
  };
  useEffect(() => {
    if (!open) return;
    setF(initial());
    setErrors({});
    setPreview("");
    Promise.all([
      editingEmployee
        ? Promise.resolve({ employeeCode: editingEmployee.employeeCode })
        : request("crew/employees/next-code"),
      request("crew/employees/form-options"),
    ])
      .then(([code, data]) => {
        setOptions(data);
        const source = editingEmployee || initialEmployee || {};
        const defaults = {
          attendanceRulesTemplate: String(
            data.attendance.find((t: any) => t.isDefault)?.id ||
              data.attendance[0]?.id ||
              "",
          ),
          workPatternTemplate: String(
            data.workPatterns.find((t: any) => t.isDefault)?.id ||
              data.workPatterns[0]?.id ||
              "",
          ),
          holidayTemplate: String(
            data.holidays.find((t: any) => t.isDefault)?.id ||
              data.holidays[0]?.id ||
              "",
          ),
          leaveTemplate: String(
            data.leave.find((t: any) => t.isDefault)?.id ||
              data.leave[0]?.id ||
              "",
          ),
          salaryTemplateId: String(
            data.salary.find((t: any) => t.isDefault)?.id ||
              data.salary[0]?.id ||
              "",
          ),
        };
        setF((x) => ({
          ...x,
          ...defaults,
          ...source,
          employeeCode: source.employeeCode || code.employeeCode,
          userId: source.userId ? String(source.userId) : "",
          reportingManager: source.reportingManager
            ? String(source.reportingManager)
            : "",
          attendanceRulesTemplate: source.attendanceRulesTemplate
            ? String(source.attendanceRulesTemplate)
            : defaults.attendanceRulesTemplate,
          workPatternTemplate: source.workPatternTemplate
            ? String(source.workPatternTemplate)
            : defaults.workPatternTemplate,
          holidayTemplate: source.holidayTemplate
            ? String(source.holidayTemplate)
            : defaults.holidayTemplate,
          leaveTemplate: source.leaveTemplate
            ? String(source.leaveTemplate)
            : defaults.leaveTemplate,
          salaryTemplateId: source.salaryTemplateId
            ? String(source.salaryTemplateId)
            : defaults.salaryTemplateId,
          skills: Array.isArray(source.skills)
            ? source.skills.join(", ")
            : source.skills || "",
          certifications: Array.isArray(source.certifications)
            ? source.certifications.join(", ")
            : source.certifications || "",
          fixedComponentValues:
            typeof source.fixedComponentValues === "string"
              ? JSON.parse(source.fixedComponentValues || "{}")
              : source.fixedComponentValues || {},
          employeePhotoFile: null,
          removePhoto: false,
          includeInUser: Boolean(source.userId),
        }));
        setPreview(source.photoUrl || "");
      })
      .catch((e) =>
        toast({
          title: "Unable to prepare form",
          description: e.message,
          variant: "destructive",
        }),
      );
  }, [open, editingEmployee, initialEmployee]);
  useEffect(
    () => () => {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const availableManagers = useMemo(
    () => employees.filter((e) => e.status !== "Offboarded"),
    [employees],
  );
  const fixedSalaryComponents = useMemo(() => {
    const template = options.salary.find(
      (item: any) => String(item.id) === String(f.salaryTemplateId),
    );
    let components = template?.components || [];
    if (typeof components === "string") {
      try {
        components = JSON.parse(components);
      } catch {
        components = [];
      }
    }
    return (Array.isArray(components) ? components : []).filter(
      (component: any) => component.calculationType === "fixed",
    );
  }, [options.salary, f.salaryTemplateId]);
  const chooseUser = (id: string) => {
    const u = options.users.find((x: any) => String(x.id) === id);
    setF((x) => ({
      ...x,
      userId: id,
      name: u?.displayName || x.name,
      email: String(u?.email || x.email).toLowerCase(),
    }));
  };
  const photo = (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      field("employeePhotoFile", null);
      setErrors((x) => ({
        ...x,
        employeePhotoFile: "Use JPG, JPEG, PNG or WEBP.",
      }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors((x) => ({
        ...x,
        employeePhotoFile: "Photo must be 5 MB or smaller.",
      }));
      return;
    }
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    field("employeePhotoFile", file);
    setPreview(URL.createObjectURL(file));
  };
  const validate = () => {
    const e: Errors = {};
    const required: [keyof Form, string][] = [
      ["name", "Name is required."],
      ["dateOfBirth", "Date of birth is required."],
      ["email", "Email is required."],
      ["phone", "Phone is required."],
      ["emergencyContactRelation", "Relation is required."],
      ["emergencyContactPhone", "Emergency phone is required."],
      ["role", "Role is required."],
      ["designation", "Designation is required."],
      ["department", "Department is required."],
      ["employmentType", "Employment type is required."],
      ["status", "Status is required."],
      ["workMode", "Work mode is required."],
      ["location", "Work location is required."],
      ["joinDate", "Joining date is required."],
      ["attendanceRulesTemplate", "Attendance template is required."],
      ["workPatternTemplate", "Work pattern is required."],
      ["holidayTemplate", "Holiday template is required."],
      ["leaveTemplate", "Leave template is required."],
      ["salaryTemplateId", "Salary template is required."],
      ["annualCtc", "Annual CTC is required."],
      ["baseSalary", "Base salary is required."],
      ["bankName", "Bank name is required."],
      ["accountHolderName", "Account holder name is required."],
      ["accountNumber", "Account number is required."],
      ["ifscCode", "IFSC code is required."],
    ];
    required.forEach(([k, m]) => {
      if (!String(f[k] ?? "").trim()) e[k] = m;
    });
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))
      e.email = "Enter a valid email.";
    for (const k of ["phone", "emergencyContactPhone"] as const)
      if (digits(f[k]).length !== 10) e[k] = "Enter exactly 10 digits.";
    if (f.alternatePhone && digits(f.alternatePhone).length !== 10)
      e.alternatePhone = "Enter exactly 10 digits.";
    if (f.dateOfBirth && f.dateOfBirth > today())
      e.dateOfBirth = "Date of birth cannot be in the future.";
    if (f.exitDate && f.joinDate && f.exitDate < f.joinDate)
      e.exitDate = "Exit date cannot be before joining date.";
    if (f.status === "Offboarded" && !f.exitDate)
      e.exitDate = "Exit date is required when offboarded.";
    for (const k of ["annualCtc", "baseSalary"] as const)
      if (f[k] !== "" && (!Number.isFinite(Number(f[k])) || Number(f[k]) < 0))
        e[k] = "Enter a non-negative amount.";
    if (f.aadhaarNumber && !/^\d{12}$/.test(f.aadhaarNumber))
      e.aadhaarNumber = "Aadhaar must contain 12 digits.";
    if (
      f.panNumber &&
      !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(f.panNumber.toUpperCase())
    )
      e.panNumber = "Enter a valid PAN number.";
    if (f.ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifscCode.toUpperCase()))
      e.ifscCode = "Enter a valid IFSC code.";
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first)
      setTimeout(
        () =>
          refs.current[first]?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          }),
        0,
      );
    return !first;
  };
  const submit = async () => {
    if (saving || !validate()) return;
    setSaving(true);
    try {
      const normalized: any = {
        ...f,
        userId: f.userId ? Number(f.userId) : null,
        reportingManager: f.reportingManager
          ? Number(f.reportingManager)
          : null,
        salaryTemplateId: Number(f.salaryTemplateId),
        annualCtc: Number(f.annualCtc),
        baseSalary: Number(f.baseSalary),
        email: f.email.trim().toLowerCase(),
        phone: digits(f.phone),
        alternatePhone: f.alternatePhone ? digits(f.alternatePhone) : null,
        emergencyContactPhone: digits(f.emergencyContactPhone),
        panNumber: f.panNumber.toUpperCase(),
        ifscCode: f.ifscCode.toUpperCase(),
        skills: tags(f.skills),
        certifications: tags(f.certifications),
      };
      delete normalized.employeePhotoFile;
      if (editingEmployee) {
        if (f.employeePhotoFile)
          normalized.photoDataUrl = await fileToDataUrl(f.employeePhotoFile);
        if (f.removePhoto) normalized.photoUrl = null;
        await request(`crew/employees/${editingEmployee.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(normalized),
        });
      } else {
        if (beforeCreate && !normalized.userId) {
          const user = await beforeCreate();
          normalized.userId = Number(user.id);
        }
        const data = new FormData();
        data.append("employee", JSON.stringify(normalized));
        if (f.employeePhotoFile)
          data.append("employeePhoto", f.employeePhotoFile);
        await request("crew/employees", { method: "POST", body: data });
      }
      onOpenChange(false);
      await onCreated();
      toast({
        title: editingEmployee
          ? "Member updated successfully."
          : "Member added successfully.",
      });
    } catch (e: any) {
      toast({
        title: editingEmployee
          ? "Unable to update member"
          : "Unable to add member",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };
  const createUser = async () => {
    try {
      const u = await request("users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      setOptions((x: any) => ({ ...x, users: [...x.users, u] }));
      chooseUser(String(u.id));
      setF((x) => ({
        ...x,
        userId: String(u.id),
        name: u.displayName,
        email: String(u.email || "").toLowerCase(),
        includeInUser: true,
      }));
      setUserDialog(false);
      toast({
        title: "User created and linked",
        description: u.temporaryPassword
          ? `Temporary password: ${u.temporaryPassword}`
          : undefined,
      });
    } catch (e: any) {
      toast({
        title: "Unable to create user",
        description: e.message,
        variant: "destructive",
      });
    }
  };
  return (
    <MemberFormContext.Provider value={{ f, errors, refs, field }}>
      <>
        <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
          <DialogContent className="flex h-[min(94vh,900px)] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
            <DialogHeader className="shrink-0 border-b px-6 py-5">
              <DialogTitle>{"Add Member"}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
              <Section title="Profile">
                <div className="grid gap-4 md:grid-cols-2">
                  {!beforeCreate ? (
                    <F
                      label="Link existing user account"
                      hint="Optional"
                      name="userId"
                      refs={refs}
                    >
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        value={f.userId}
                        onChange={(e) => chooseUser(e.target.value)}
                      >
                        <option value="">Select user (optional)</option>
                        {options.users.map((u: any) => (
                          <option key={u.id} value={u.id}>
                            {u.displayName} {u.email ? `— ${u.email}` : ""}
                          </option>
                        ))}
                      </select>
                    </F>
                  ) : (
                    <div className="md:col-span-2 rounded-xl border border-primary/20 bg-primary/5 p-4">
                      <p className="text-sm font-semibold">
                        User account and Crew member will be created together
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Complete every required employee field below. The new
                        account will be linked automatically when you add the
                        member.
                      </p>
                    </div>
                  )}
                  {!beforeCreate && can("settings.user_management.create") && (
                    <label className="md:col-span-2 flex gap-3 rounded-xl border bg-muted/20 p-4">
                      <input
                        type="checkbox"
                        checked={f.includeInUser}
                        onChange={(e) => {
                          field("includeInUser", e.target.checked);
                          if (e.target.checked) setUserDialog(true);
                        }}
                      />
                      <span>
                        <b className="text-sm">Include in User</b>
                        <small className="mt-1 block text-muted-foreground">
                          Opens the ‘Add New User’ dialog. Once the user is
                          created, their full name and email are filled in here
                          and the account is linked automatically.
                        </small>
                      </span>
                    </label>
                  )}
                  <Text
                    k="name"
                    label="Name"
                    required
                    placeholder="e.g., Ananya Reddy"
                  />
                  <Text
                    k="dateOfBirth"
                    label="Date of Birth"
                    required
                    type="date"
                    max={today()}
                  />
                  <Choice
                    k="gender"
                    label="Gender"
                    items={["Male", "Female", "Other", "Prefer not to say"]}
                  />
                  <div className="md:col-span-2 rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-xl font-bold text-primary-foreground">
                        {preview ? (
                          <img
                            src={preview}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          (f.name.trim()[0] || "E").toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 text-sm font-medium">
                          Profile Photo
                        </div>
                        <Input
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                          onChange={(e) => photo(e.target.files?.[0])}
                        />
                        <small className="text-muted-foreground">
                          JPG, JPEG, PNG, or WEBP. Maximum 5 MB.
                        </small>
                        {f.employeePhotoFile && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-1 text-destructive"
                            onClick={() => {
                              field("employeePhotoFile", null);
                              setPreview("");
                            }}
                          >
                            <Trash2 className="mr-1 h-4 w-4" />
                            Remove
                          </Button>
                        )}
                        <Err text={errors.employeePhotoFile} />
                      </div>
                    </div>
                  </div>
                  <Text
                    k="email"
                    label="Email"
                    required
                    placeholder="e.g., ananya@company.com"
                    type="email"
                  />
                  <Text k="phone" label="Phone" required inputMode="numeric" />
                  <Text
                    k="alternatePhone"
                    label="Alternate Phone"
                    inputMode="numeric"
                  />
                  <Choice
                    k="maritalStatus"
                    label="Marital Status"
                    items={[
                      "Single",
                      "Married",
                      "Divorced",
                      "Widowed",
                      "Other",
                    ]}
                  />
                  <Choice
                    k="bloodGroup"
                    label="Blood Group"
                    items={["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]}
                  />
                  <Text k="fatherName" label="Father's Name" />
                  <Text k="motherName" label="Mother's Name" />
                  <Choice
                    k="emergencyContactRelation"
                    label="Emergency Contact Relation"
                    required
                    items={["Father", "Mother", "Brother", "Sister", "Other"]}
                  />
                  <Text
                    k="emergencyContactPhone"
                    label="Emergency Contact Phone"
                    required
                    inputMode="numeric"
                  />
                </div>
              </Section>
              <Section title="HR & Compliance">
                <div className="grid gap-4 md:grid-cols-2">
                  <Text
                    k="role"
                    label="Role"
                    required
                    placeholder="e.g., Production Operator"
                  />
                  <Text
                    k="designation"
                    label="Designation"
                    required
                    placeholder="e.g., Senior Operator"
                  />
                  <Text
                    k="department"
                    label="Department"
                    required
                    placeholder="e.g., Production"
                  />
                  <Text
                    k="employeeCode"
                    label="Employee Code"
                    required
                    disabled
                  />
                  <Text
                    k="location"
                    label="Work Location"
                    required
                    placeholder="Office / Branch / City"
                  />
                  <Choice
                    k="employmentType"
                    label="Employment Type"
                    required
                    items={[
                      "Full-time",
                      "Part-time",
                      "Contract",
                      "Intern",
                      "Consultant",
                      "Trainee",
                    ]}
                  />
                  <Text
                    k="annualCtc"
                    label="Annual CTC"
                    required
                    type="number"
                    min="0"
                  />
                  <F
                    label="Monthly CTC (auto-calculated)"
                    name="monthly"
                    refs={refs}
                  >
                    <Input
                      disabled
                      value={
                        f.annualCtc
                          ? `₹${(Number(f.annualCtc) / 12).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
                          : ""
                      }
                    />
                  </F>
                  <Text
                    k="baseSalary"
                    label="Base Salary"
                    required
                    type="number"
                    min="0"
                  />
                  <Text
                    k="joinDate"
                    label="Joining Date"
                    required
                    type="date"
                  />
                  <Text
                    k="exitDate"
                    label="Exit Date"
                    type="date"
                    min={f.joinDate}
                  />
                  <Choice
                    k="workMode"
                    label="Work Mode"
                    required
                    items={["Remote", "Hybrid", "On-site", "Contract"]}
                  />
                  <Choice
                    k="reportingManager"
                    label="Reporting Manager"
                    items={availableManagers.map((e) => ({
                      value: String(e.id),
                      label: `${e.name} (${e.employeeCode})`,
                    }))}
                  />
                  <Template
                    k="attendanceRulesTemplate"
                    label="Attendance Rules Template"
                    items={options.attendance}
                  />
                  <Template
                    k="workPatternTemplate"
                    label="Work Pattern Template"
                    required
                    items={options.workPatterns}
                  />
                  <Template
                    k="holidayTemplate"
                    label="Holiday Template"
                    required
                    items={options.holidays}
                  />
                  <Template
                    k="leaveTemplate"
                    label="Leave Template"
                    required
                    items={options.leave}
                  />
                </div>
              </Section>
              <Section title="Salary & Statutory Details">
                <div className="grid gap-4 md:grid-cols-2">
                  <Template
                    k="salaryTemplateId"
                    label="Salary Template"
                    required
                    items={options.salary}
                  />
                  {fixedSalaryComponents.map((component: any) => {
                    const key = String(component.id || component.name);
                    return (
                      <F
                        key={key}
                        label={`${component.name} (monthly fixed amount)`}
                        name={`fixed-${key}`}
                        refs={refs}
                      >
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={
                            f.fixedComponentValues[key] ?? component.value ?? ""
                          }
                          onChange={(event) =>
                            field("fixedComponentValues", {
                              ...f.fixedComponentValues,
                              [key]: event.target.value,
                            })
                          }
                        />
                      </F>
                    );
                  })}
                  <Choice
                    k="status"
                    label="Status"
                    required
                    items={["Active", "On Leave", "Offboarded"]}
                  />
                  <Text
                    k="skills"
                    label="Skills (comma-separated)"
                    placeholder="e.g., React, Node.js, MongoDB"
                  />
                  <Text
                    k="certifications"
                    label="Certifications (comma-separated)"
                    placeholder="e.g., AWS, PMP"
                  />
                  <Text
                    k="aadhaarNumber"
                    label="Aadhaar Number"
                    inputMode="numeric"
                  />
                  <Text k="panNumber" label="PAN Number" />
                  <Text k="uan" label="UAN" />
                  <Text k="pfNumber" label="PF Number" />
                  <Text k="pfJoiningDate" label="PF Joining Date" type="date" />
                  <Text k="esiNumber" label="ESI Number" />
                </div>
              </Section>
              <Section title="Bank Details">
                <div className="grid gap-4 md:grid-cols-2">
                  <Text k="bankName" label="Bank Name" required />
                  <Text
                    k="accountHolderName"
                    label="Account Holder Name"
                    required
                  />
                  <Text k="accountNumber" label="Account Number" required />
                  <Text k="ifscCode" label="IFSC Code" required />
                </div>
              </Section>
            </div>
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button disabled={saving} onClick={submit}>
                {saving ? "Adding Member..." : "Add Member"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={userDialog} onOpenChange={setUserDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <Input
                placeholder="Full name"
                value={newUser.name}
                onChange={(e) =>
                  setNewUser((x) => ({ ...x, name: e.target.value }))
                }
              />
              <Input
                placeholder="Email"
                value={newUser.email}
                onChange={(e) =>
                  setNewUser((x) => ({ ...x, email: e.target.value }))
                }
              />
              <Input
                placeholder="Username"
                value={newUser.username}
                onChange={(e) =>
                  setNewUser((x) => ({
                    ...x,
                    username: e.target.value.toLowerCase(),
                  }))
                }
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUserDialog(false)}>
                Cancel
              </Button>
              <Button onClick={createUser}>Create & Link</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    </MemberFormContext.Provider>
  );
}
function Text({
  k,
  label,
  required,
  ...props
}: {
  k: keyof Form;
  label: string;
  required?: boolean;
  [x: string]: any;
}) {
  const { f, errors, refs, field } = useMemberForm();
  return (
    <F label={label} required={required} error={errors[k]} name={k} refs={refs}>
      <Input
        className={errors[k] ? "border-destructive" : ""}
        value={String(f[k] ?? "")}
        onChange={(e) => field(k, e.target.value)}
        {...props}
      />
    </F>
  );
}
function Choice({
  k,
  label,
  required,
  items,
}: {
  k: keyof Form;
  label: string;
  required?: boolean;
  items: any[];
}) {
  const { f, errors, refs, field } = useMemberForm();
  return (
    <F label={label} required={required} error={errors[k]} name={k} refs={refs}>
      <select
        className={`h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ${errors[k] ? "border-destructive" : ""}`}
        value={String(f[k] ?? "")}
        onChange={(e) => field(k, e.target.value)}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {items.map((item: any) => {
          const value = typeof item === "string" ? item : item.value,
            label = typeof item === "string" ? item : item.label;
          return (
            <option
              key={value}
              value={value}
              disabled={Boolean(typeof item === "object" && item.disabled)}
            >
              {label}
            </option>
          );
        })}
      </select>
    </F>
  );
}
function Template({
  k,
  label,
  required,
  items,
}: {
  k: keyof Form;
  label: string;
  required?: boolean;
  items: any[];
}) {
  const { f } = useMemberForm();
  const joiningYear = Number(String(f.joinDate || today()).slice(0, 4));
  const holiday = k === "holidayTemplate";
  return (
    <Choice
      k={k}
      label={label}
      required={required}
      items={items.map((item: any) => {
        const wrongYear = holiday && Number(item.effectiveYear) !== joiningYear;
        return {
          value: String(item.id),
          disabled: wrongYear,
          label: `${item.templateName}${holiday && item.effectiveYear ? ` (${item.effectiveYear})` : ""}${item.isDefault ? " (Default)" : ""}${wrongYear ? " � Not applicable to joining year" : ""}`,
        };
      })}
    />
  );
}
function Section({ title, children }: { title: string; children: any }) {
  return (
    <section className="space-y-4 border-b pb-7 last:border-0">
      <h3 className="flex items-center justify-between font-semibold">
        {title}
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </h3>
      {children}
    </section>
  );
}
function F({
  label,
  required,
  error,
  name,
  refs,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  error?: string;
  name: string;
  refs: any;
  children: any;
  hint?: string;
}) {
  return (
    <label
      ref={(el) => {
        refs.current[name] = el;
      }}
      className="space-y-1.5 text-sm"
    >
      <span className="font-medium">
        {label}
        {required && <b className="text-destructive"> *</b>}{" "}
        {hint && (
          <small className="font-normal text-muted-foreground">({hint})</small>
        )}
      </span>
      {children}
      <Err text={error} />
    </label>
  );
}
function Err({ text }: { text?: string }) {
  return text ? <small className="block text-destructive">{text}</small> : null;
}
